<?php

/**
 * DatabaseCreate — provision a MySQL/MariaDB database + user (Galera, behind
 * ProxySQL) for the roxyon CLI / MCP connector.
 *
 *   POST /databases/create
 *        body: { name, subscription? }
 *        -> { objectId, name, username, password, host, status }
 *
 * Auth: X-BEA-Session-Token, or `Authorization: Bearer roxp_…` with the `deploy`
 * scope. Same shape as DomainCreate.php: write the pending BaaS row on the
 * master key (ownership checked here, never trusted from the body), then let
 * the already-live `pollDBs()` -> `createDB()` reconciler do the work.
 *
 * WHY THE NAME IS PREFIXED
 * ------------------------
 * `Databases.Name` is a real MySQL database name on the shared Galera cluster —
 * there is no per-tenant schema namespace, so two customers picking "wordpress"
 * would collide. Every name is prefixed with the subscription's own username
 * (same convention FtpAccounts already uses: `{subscription}_{suffix}`).
 *
 * The password is returned ONCE, in this response — `Databases.Password` is
 * stored encrypted (`$server->enc`) for the reconciler's own use, and there is
 * no endpoint that reads it back out.
 */
class DatabaseCreate
{
    private const NAME_RE = '/^[a-z][a-z0-9_]{0,31}$/';
    private const MAX_IDENTIFIER = 32; // MySQL user/db identifier ceiling we stay under
    private const RL_MAX = 20;
    private const RL_WINDOW = 3600;
    private const POLL_SECONDS = 10;

    public function __construct(
        private $server,
        private array $config,
    ) {
    }

    public function handle($req, $res, array $nodes, $data): void
    {
        $res->header('Content-Type', 'application/json');

        if (($req->server['request_method'] ?? 'GET') !== 'POST') {
            $this->fail($res, 405, 'Method not allowed');
            return;
        }

        $who = apiCaller($this->server, $req, 'deploy');
        if ($who === null) {
            $this->fail($res, 401, 'Not signed in (session token or a Bearer PAT is required)');
            return;
        }
        if (isset($who['denied'])) {
            $this->fail($res, 403, 'This access token does not have the "' . $who['denied'] . '" scope');
            return;
        }

        $b      = $this->body($data);
        $suffix = strtolower(trim((string) ($b['name'] ?? '')));
        if (preg_match(self::NAME_RE, $suffix) !== 1) {
            $this->fail($res, 400, 'Pass "name": lowercase letters, digits, underscore, starting with a letter.');
            return;
        }

        // --- subscription --------------------------------------------------
        $subId = trim((string) ($b['subscription'] ?? ''));
        if ($subId === '') {
            $subs = $who['subs'];
            if (count($subs) === 1) {
                $subId = (string) $subs[0];
            } else {
                $this->fail($res, 400, 'Pass "subscription" — this account has more than one.');
                return;
            }
        }
        if (!in_array($subId, $who['subs'], true)) {
            $this->fail($res, 403, 'That subscription is not on your account');
            return;
        }

        $sub = $this->one('/Subscriptions', [
            'fields' => 'objectId,Username,Status',
            'limit'  => 1,
            'where'  => ['objectId' => $subId],
        ]);
        if (!$sub || empty($sub->Username)) {
            $this->fail($res, 404, 'Subscription not found');
            return;
        }

        $dbName = $sub->Username . '_' . $suffix;
        if (strlen($dbName) > self::MAX_IDENTIFIER) {
            $this->fail($res, 400, "\"{$suffix}\" makes the database name too long (\"{$dbName}\", max " . self::MAX_IDENTIFIER . ' chars including the account prefix). Pick something shorter.');
            return;
        }
        $dbUsername = $dbName; // one user per database — matches add-database.sh's grant-all-on-that-db model

        // --- already exists on this account? no-op --------------------------
        $existing = $this->one('/Databases', [
            'fields' => 'objectId,Name,Status,Subscription',
            'limit'  => 1,
            'where'  => ['Name' => $dbName, 'eye' => ['in' => '1,0']],
        ]);
        if ($existing) {
            if ((string) ($existing->Subscription ?? '') !== $subId) {
                $this->fail($res, 409, 'That database name is already in use.');
                return;
            }
            $this->ok($res, [
                'objectId' => (string) $existing->objectId,
                'name'     => $dbName,
                'username' => $dbUsername,
                'status'   => $this->publicStatus((string) ($existing->Status ?? '')),
            ]);
            return;
        }

        if (!$this->rateOk($subId)) {
            $this->fail($res, 429, 'Too many databases created recently — try again later.');
            return;
        }

        // --- password: caller-supplied or generated -------------------------
        $password = (string) ($b['password'] ?? '');
        if ($password === '') {
            $password = $this->generatePassword();
        } elseif (preg_match('/[\x00-\x1f]/', $password) === 1) {
            $this->fail($res, 400, 'Password contains a control character that cannot be used.');
            return;
        }

        // --- write the pending row ------------------------------------------
        try {
            $r = $this->server->rx->post('/Databases', [
                'Name'         => $dbName,
                'Username'     => $dbUsername,
                'Password'     => $this->server->enc->encode($password),
                'Subscription' => $subId,
                'Owner'        => $who['uid'],
                'Status'       => 'pending',
                'eye'          => 1,
            ]);
            $newId = $this->idOf($r);
            if ($newId === '') {
                throw new \RuntimeException($this->apiError($r) ?: 'no database id returned');
            }
        } catch (\Throwable $e) {
            error_log('[databasecreate] ' . $dbName . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not create the database');
            return;
        }

        // --- brief poll so the connector can report a real status -----------
        $status = 'provisioning';
        $deadline = microtime(true) + self::POLL_SECONDS;
        while (microtime(true) < $deadline) {
            usleep(1_500_000);
            $row = $this->one('/Databases', [
                'fields' => 'objectId,Status,Error',
                'limit'  => 1,
                'where'  => ['objectId' => $newId],
            ]);
            $s = strtolower((string) ($row->Status ?? ''));
            if ($s === 'active') {
                $status = 'active';
                break;
            }
            if ($s === 'failed') {
                $this->ok($res, [
                    'objectId' => $newId,
                    'name'     => $dbName,
                    'username' => $dbUsername,
                    'status'   => 'failed',
                    'error'    => (string) ($row->Error ?? 'provisioning failed'),
                ]);
                return;
            }
        }

        $this->ok($res, [
            'objectId' => $newId,
            'name'     => $dbName,
            'username' => $dbUsername,
            'password' => $password, // shown once — not retrievable afterwards
            'host'     => $this->resolveHost($subId),
            'status'   => $status,
        ]);
    }

    // --------------------------------------------------------------------

    /** The subscription's own node, on the internal VLAN, where its ProxySQL listens on :6033. */
    private function resolveHost(string $subId): ?string
    {
        try {
            $r = $this->server->rx->get('/Subscriptions', [
                'fields' => 'objectId',
                'limit'  => 1,
                'where'  => ['objectId' => $subId],
                'include' => [[
                    'className' => 'IPs',
                    'field'     => 'IP',
                    'fields'    => 'IP',
                ]],
            ]);
            $row = (is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []))[0] ?? null;
            $ip  = $row->_IP->results[0]->IP ?? null;
            return $ip ? "{$ip}:6033" : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function generatePassword(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_.';
        $out = '';
        for ($i = 0; $i < 24; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $out;
    }

    private function publicStatus(string $raw): string
    {
        $s = strtolower($raw);
        if ($s === 'active') return 'active';
        if ($s === 'failed') return 'failed';
        return 'provisioning';
    }

    private function rateOk(string $subId): bool
    {
        try {
            $key = 'databases:create:' . $subId;
            $n = (int) $this->server->redis->execute('incr', $key);
            if ($n === 1) {
                $this->server->redis->execute('expire', $key, self::RL_WINDOW);
            }
            return $n <= self::RL_MAX;
        } catch (\Throwable $e) {
            return true;
        }
    }

    // -- helpers (mirror DomainCreate.php) --------------------------------

    private function one(string $path, array $q): ?object
    {
        try {
            $r    = $this->server->rx->get($path, $q);
            $rows = is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []);
            $row  = $rows[0] ?? null;
            return is_array($row) ? (object) $row : $row;
        } catch (\Throwable $e) {
            error_log('[databasecreate] query ' . $path . ': ' . $e->getMessage());
            return null;
        }
    }

    private function idOf($r): string
    {
        if (is_object($r)) $r = (array) $r;
        $rows = $r['results'] ?? [];
        $row  = is_object($rows[0] ?? null) ? (array) $rows[0] : ($rows[0] ?? []);
        return (string) ($row['objectId'] ?? '');
    }

    private function apiError($r): string
    {
        if (is_object($r)) $r = (array) $r;
        if (!is_array($r)) return '';
        if (!empty($r['error'])) return (string) $r['error'];
        foreach (($r['results'] ?? []) as $row) {
            $row = is_object($row) ? (array) $row : $row;
            if (is_array($row) && !empty($row['error'])) return (string) $row['error'];
        }
        return '';
    }

    /** @return array<string,mixed> */
    private function body($data): array
    {
        if (is_array($data))  return $data;
        if (is_object($data)) return (array) $data;
        if (is_string($data) && $data !== '') {
            $j = json_decode($data, true);
            return is_array($j) ? $j : [];
        }
        return [];
    }

    private function fail($res, int $status, string $error): void
    {
        $res->status($status);
        $res->end(json_encode(['error' => $error]));
    }

    private function ok($res, array $data): void
    {
        $res->status(200);
        $res->end(json_encode(['ok' => true] + $data));
    }
}
