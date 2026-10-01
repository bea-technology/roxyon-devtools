<?php

/**
 * SshPasswordReset — set a subscription's SSH/SFTP/file-manager shell
 * password for the roxyon CLI / MCP connector.
 *
 *   POST /ssh/password
 *        body: { subscription?, password? }
 *        -> { subscription, password, status }
 *
 * Auth: X-BEA-Session-Token, or `Authorization: Bearer roxp_…` with the
 * `deploy` scope.
 *
 * Unlike Database/Email, there is no BaaS row + poller for this — it is a
 * direct one-shot action, exactly mirroring what the console's own
 * change_ssh_password.view already does: create a `subscription.ssh.password`
 * Task and let the already-live `handleSshPassword()` apply it. This endpoint
 * exists only to let a non-browser caller (CLI / MCP) reach that same path,
 * with the same ownership check every other endpoint here does on the master
 * key.
 *
 * The password is returned ONCE. The worker clears the Task payload the
 * moment it is applied (`handleSshPassword()`'s own doc comment) and nothing
 * stores it anywhere — if this response is lost, the only recovery is to
 * reset it again.
 */
class SshPasswordReset
{
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

        $b = $this->body($data);

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
            'fields' => 'objectId,Username,Node,Status',
            'limit'  => 1,
            'where'  => ['objectId' => $subId],
        ]);
        if (!$sub || empty($sub->Username)) {
            $this->fail($res, 404, 'Subscription not found');
            return;
        }

        $password = (string) ($b['password'] ?? '');
        if ($password === '') {
            $password = $this->generatePassword();
        }
        if ($err = $this->passwordError($password)) {
            $this->fail($res, 400, $err);
            return;
        }

        if (!$this->rateOk($subId)) {
            $this->fail($res, 429, 'Too many password resets recently — try again later.');
            return;
        }

        try {
            $r = $this->server->rx->post('/Tasks', [
                'Action'       => 'subscription.ssh.password',
                'Status'       => 'pending',
                'User'         => $who['uid'],
                // Pin to the node holding this container — set-ssh-password.sh
                // runs against the container, so a task landing anywhere else
                // fails with "Container not found" (same as the console UI's own
                // change_ssh_password.view).
                'Node'         => $sub->Node ?? null,
                'Subscription' => $subId,
                'Priority'     => 1,
                'Payload'      => json_encode(['password' => $password]),
            ]);
            $taskId = $this->idOf($r);
            if ($taskId === '') {
                throw new \RuntimeException($this->apiError($r) ?: 'no task id returned');
            }
        } catch (\Throwable $e) {
            error_log('[sshpasswordreset] ' . $subId . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not queue the password change');
            return;
        }

        // Poll the Task itself (there is no BaaS resource row for this action).
        $status = 'pending';
        $deadline = microtime(true) + self::POLL_SECONDS;
        while (microtime(true) < $deadline) {
            usleep(1_500_000);
            $t = $this->one('/Tasks', [
                'fields' => 'objectId,Status',
                'limit'  => 1,
                'where'  => ['objectId' => $taskId],
            ]);
            $s = strtolower((string) ($t->Status ?? ''));
            if ($s === 'completed' || $s === 'done' || $s === 'success') {
                $status = 'active';
                break;
            }
            if ($s === 'failed') {
                $status = 'failed';
                break;
            }
        }

        $this->ok($res, [
            'subscription' => $subId,
            'password'     => $password, // shown once — the worker clears its own copy
            'status'       => $status,
        ]);
    }

    // --------------------------------------------------------------------

    /** Mirrors sshPassRules() in change_ssh_password.view — one standard, one place. */
    private function passwordError(string $p): ?string
    {
        if (strlen($p) < 12) return 'Use at least 12 characters.';
        if (!preg_match('/[A-Z]/', $p)) return 'Include an uppercase letter.';
        if (!preg_match('/[a-z]/', $p)) return 'Include a lowercase letter.';
        if (!preg_match('/[0-9]/', $p)) return 'Include a number.';
        if (!preg_match('/[^A-Za-z0-9]/', $p)) return 'Include a symbol.';
        if (strpos($p, ':') !== false) return 'A colon cannot be used in this password.';
        if (preg_match('/[\r\n]/', $p)) return 'A line break cannot be used in this password.';
        return null;
    }

    private function generatePassword(): string
    {
        // Guaranteed to satisfy passwordError(): one of each required class,
        // then random fill from a safe alphabet (no `:`, no whitespace).
        $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        $lower = 'abcdefghijkmnpqrstuvwxyz';
        $digit = '23456789';
        $symbol = '!@#$%^&*-_+=';
        $all = $upper . $lower . $digit . $symbol;

        $pw = [
            $upper[random_int(0, strlen($upper) - 1)],
            $lower[random_int(0, strlen($lower) - 1)],
            $digit[random_int(0, strlen($digit) - 1)],
            $symbol[random_int(0, strlen($symbol) - 1)],
        ];
        for ($i = 0; $i < 12; $i++) {
            $pw[] = $all[random_int(0, strlen($all) - 1)];
        }
        shuffle($pw);
        return implode('', $pw);
    }

    private function rateOk(string $subId): bool
    {
        try {
            $key = 'ssh:password:' . $subId;
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
            error_log('[sshpasswordreset] query ' . $path . ': ' . $e->getMessage());
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
