<?php

/**
 * EmailCreate — provision a mailbox for the roxyon CLI / MCP connector.
 *
 *   POST /emails/create
 *        body: { localPart, domain, password?, quota?, forwardTo?, saveCopy? }
 *        -> { objectId, email, quota, status }
 *
 * Auth: X-BEA-Session-Token, or `Authorization: Bearer roxp_…` with the `deploy`
 * scope. Same shape as DomainCreate.php / DatabaseCreate.php: write the
 * pending `Emails` row on the master key, ownership checked here, then let the
 * already-live `pollEmails()` -> `handleEmailCreate()` reconciler do the work
 * (Maildir creation, `email_management` MySQL upsert).
 *
 * `domain` is a hostname already on the account (not an objectId) — resolved
 * and ownership-checked the same way DomainCreate.php resolves a parent.
 *
 * PASSWORD HASH: must match exactly what the console frontend's `gH()`
 * (src/index.js) produces — Dovecot's `{BLF-CRYPT}` scheme prefix over a
 * bcrypt hash (cost 12). PHP's own bcrypt (`PASSWORD_BCRYPT`) is
 * wire-compatible with the bcryptjs hash the frontend generates; don't invent
 * a different scheme here or the mailbox won't authenticate.
 */
class EmailCreate
{
    private const LOCAL_RE = '/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/';
    private const RL_MAX = 20;
    private const RL_WINDOW = 3600;
    private const POLL_SECONDS = 10;
    private const DEFAULT_QUOTA_MB = 1024;

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

        $b     = $this->body($data);
        $local = strtolower(trim((string) ($b['localPart'] ?? '')));
        if (preg_match(self::LOCAL_RE, $local) !== 1) {
            $this->fail($res, 400, 'Pass "localPart": lowercase letters, digits, `.`, `_`, `-`.');
            return;
        }

        $domainName = strtolower(trim((string) ($b['domain'] ?? '')));
        if ($domainName === '') {
            $this->fail($res, 400, 'Pass "domain" — a hostname already on this account.');
            return;
        }

        $domain = $this->one('/Domains', [
            'fields' => 'objectId,Name,Subscription,Status',
            'limit'  => 1,
            'where'  => ['Name' => $domainName, 'eye' => ['in' => '1,0']],
        ]);
        if (!$domain || !in_array((string) ($domain->Subscription ?? ''), $who['subs'], true)) {
            $this->fail($res, 403, "\"{$domainName}\" is not a host on your account.");
            return;
        }
        $subId = (string) $domain->Subscription;
        $email = $local . '@' . $domainName;

        $existing = $this->one('/Emails', [
            'fields' => 'objectId,Status',
            'limit'  => 1,
            'where'  => ['Email' => $email, 'eye' => ['in' => '1,0']],
        ]);
        if ($existing) {
            $this->ok($res, [
                'objectId' => (string) $existing->objectId,
                'email'    => $email,
                'status'   => $this->publicStatus((string) ($existing->Status ?? '')),
            ]);
            return;
        }

        if (!$this->rateOk($subId)) {
            $this->fail($res, 429, 'Too many mailboxes created recently — try again later.');
            return;
        }

        $password = (string) ($b['password'] ?? '');
        if ($password === '') {
            $password = $this->generatePassword();
        }
        $quota = (int) ($b['quota'] ?? self::DEFAULT_QUOTA_MB);
        if ($quota <= 0) {
            $quota = self::DEFAULT_QUOTA_MB;
        }

        try {
            $r = $this->server->rx->post('/Emails', [
                'LocalPart'   => $local,
                'Email'       => $email,
                'Domain'      => (string) $domain->objectId,
                'Subscription' => $subId,
                'Owner'       => $who['uid'],
                'PasswordHash' => $this->hashPassword($password),
                'Quota'       => $quota,
                'ForwardTo'   => (string) ($b['forwardTo'] ?? ''),
                'SaveCopy'    => !empty($b['saveCopy']),
                'Status'      => 'pending',
                'eye'         => 1,
            ]);
            $newId = $this->idOf($r);
            if ($newId === '') {
                throw new \RuntimeException($this->apiError($r) ?: 'no email id returned');
            }
        } catch (\Throwable $e) {
            error_log('[emailcreate] ' . $email . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not create the mailbox');
            return;
        }

        $status = 'provisioning';
        $deadline = microtime(true) + self::POLL_SECONDS;
        while (microtime(true) < $deadline) {
            usleep(1_500_000);
            $row = $this->one('/Emails', [
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
                    'email'    => $email,
                    'status'   => 'failed',
                    'error'    => (string) ($row->Error ?? 'provisioning failed'),
                ]);
                return;
            }
        }

        $this->ok($res, [
            'objectId' => $newId,
            'email'    => $email,
            'password' => $password, // shown once — not retrievable afterwards
            'quota'    => $quota,
            'status'   => $status,
        ]);
    }

    // --------------------------------------------------------------------

    /** Dovecot `{BLF-CRYPT}` — must match src/index.js's `gH()` exactly. */
    private function hashPassword(string $plain): string
    {
        return '{BLF-CRYPT}' . password_hash($plain, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    private function generatePassword(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_.';
        $out = '';
        for ($i = 0; $i < 20; $i++) {
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
            $key = 'emails:create:' . $subId;
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
            error_log('[emailcreate] query ' . $path . ': ' . $e->getMessage());
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
