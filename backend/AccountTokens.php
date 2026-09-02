<?php

/**
 * AccountTokens — Personal Access Tokens for the roxyon CLI / CI.
 *
 *   POST   /account/tokens          { name, scopes?, expiresInDays? }   -> { token: "roxp_…" } ONCE
 *   GET    /account/tokens                                              -> [ { id, name, prefix, scopes, … } ]
 *   DELETE /account/tokens?id=<id>   (or /account/tokens/<id>)          -> { ok: true }
 *
 * Auth: X-BEA-Session-Token only. You manage PATs while signed in — a PAT
 * cannot mint or revoke another PAT.
 *
 * Only the sha-256 of the token is stored (`TokenHash`); the plaintext is shown
 * exactly once, at creation. `patIdentify()` in server.php resolves it on the
 * deploy endpoints.
 */
class AccountTokens
{
    private const SCOPES  = ['deploy', 'logs', 'read'];
    private const DEFAULT = ['deploy', 'logs'];
    private const ID_RE   = '/^[A-Za-z0-9]{1,40}$/';

    public function __construct(
        private $server,
        private array $config,
    ) {
    }

    public function handle($req, $res, array $nodes, $data): void
    {
        $res->header('Content-Type', 'application/json');

        $token = (string) ($req->header['x-bea-session-token'] ?? '');
        $who   = wsIdentify($this->server, $token);
        if ($who === null) {
            $this->fail($res, 401, 'Not signed in');
            return;
        }
        $uid    = $who['uid'];
        $method = strtoupper((string) ($req->server['request_method'] ?? 'GET'));

        if ($method === 'GET') {
            $this->list($res, $uid);
            return;
        }
        if ($method === 'POST') {
            $this->create($res, $uid, $this->body($data));
            return;
        }
        if ($method === 'DELETE') {
            $id = trim((string) ($req->get['id'] ?? $nodes[2] ?? ''));
            $this->revoke($res, $uid, $id);
            return;
        }
        $this->fail($res, 405, 'Method not allowed');
    }

    // ---------------------------------------------------------------------

    private function list($res, string $uid): void
    {
        try {
            $r = $this->server->rx->get('/PersonalAccessTokens', [
                'fields' => 'objectId,Name,TokenPrefix,Scopes,LastUsedAt,ExpiresAt,Revoked,createdAt',
                'limit'  => -1,
                'order'  => '-createdAt',
                'where'  => ['User' => $uid],
            ]);
            $rows = is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []);
        } catch (\Throwable $e) {
            error_log('[pat] list ' . $uid . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not list tokens');
            return;
        }

        $out = [];
        foreach ($rows as $row) {
            $row = is_object($row) ? (array) $row : $row;
            if (($row['Revoked'] ?? '0') === '1') continue;
            $out[] = [
                'id'         => (string) ($row['objectId'] ?? ''),
                'name'       => (string) ($row['Name'] ?? ''),
                'prefix'     => (string) ($row['TokenPrefix'] ?? ''),
                'scopes'     => array_values(array_filter(array_map('trim', explode(',', (string) ($row['Scopes'] ?? ''))))),
                'lastUsedAt' => (string) ($row['LastUsedAt'] ?? '') ?: null,
                'expiresAt'  => (string) ($row['ExpiresAt'] ?? '') ?: null,
                'createdAt'  => (string) ($row['createdAt'] ?? ''),
            ];
        }
        $this->ok($res, ['tokens' => $out]);
    }

    private function create($res, string $uid, array $d): void
    {
        $name = trim((string) ($d['name'] ?? ''));
        if ($name === '' || strlen($name) > 60) {
            $this->fail($res, 400, 'A token name (1–60 chars) is required');
            return;
        }

        $scopes = $d['scopes'] ?? self::DEFAULT;
        if (is_string($scopes)) {
            $scopes = array_map('trim', explode(',', $scopes));
        }
        $scopes = array_values(array_intersect(self::SCOPES, array_map('strtolower', (array) $scopes)));
        if (!$scopes) {
            $this->fail($res, 400, 'scopes must be a non-empty subset of: ' . implode(', ', self::SCOPES));
            return;
        }

        $expiresAt = '';
        $days = (int) ($d['expiresInDays'] ?? 0);
        if ($days > 0) {
            $expiresAt = date('c', time() + $days * 86400);
        }

        // roxp_ + 40 hex = 45 chars. Prefix stored for display is the first 14.
        $secret = 'roxp_' . bin2hex(random_bytes(20));
        $hash   = hash('sha256', $secret);

        try {
            $mk = $this->server->rx->post('/PersonalAccessTokens', [
                'User'        => $uid,
                'Name'        => $name,
                'TokenPrefix' => substr($secret, 0, 14),
                'TokenHash'   => $hash,
                'Scopes'      => implode(',', $scopes),
                'ExpiresAt'   => $expiresAt,
                'LastUsedAt'  => '',
                'Revoked'     => '0',
            ]);
            if ($this->apiError($mk) !== '') {
                throw new \RuntimeException($this->apiError($mk));
            }
        } catch (\Throwable $e) {
            error_log('[pat] create ' . $uid . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not create the token');
            return;
        }

        $this->ok($res, [
            'token'     => $secret,      // shown once
            'name'      => $name,
            'scopes'    => $scopes,
            'expiresAt' => $expiresAt ?: null,
            'hint'      => 'Copy this now — it will not be shown again. Use it as ROXYON_TOKEN.',
        ]);
    }

    private function revoke($res, string $uid, string $id): void
    {
        if (preg_match(self::ID_RE, $id) !== 1) {
            $this->fail($res, 400, 'A token id is required');
            return;
        }
        $row = null;
        try {
            $r = $this->server->rx->get('/PersonalAccessTokens', [
                'fields' => 'objectId,User',
                'limit'  => 1,
                'where'  => ['objectId' => $id],
            ]);
            $row = is_object($r) ? ($r->results[0] ?? null) : ($r['results'][0] ?? null);
            $row = is_object($row) ? (array) $row : $row;
        } catch (\Throwable $e) {
        }
        // Same answer for "not yours" and "gone".
        if (!$row || (string) ($row['User'] ?? '') !== $uid) {
            $this->fail($res, 404, 'Token not found');
            return;
        }

        try {
            $this->server->rx->put('/PersonalAccessTokens/' . $id, ['Revoked' => '1']);
        } catch (\Throwable $e) {
            error_log('[pat] revoke ' . $id . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not revoke the token');
            return;
        }
        $this->ok($res, ['revoked' => $id]);
    }

    // ---------------------------------------------------------------------

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
