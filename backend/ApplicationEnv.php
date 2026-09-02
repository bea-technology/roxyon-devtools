<?php

/**
 * ApplicationEnv — read / merge an application's environment variables, for the
 * roxyon CLI and MCP server (so a PAT-only CI job manages env without BaaS
 * write access).
 *
 *   GET  /applications/env?application=<id>            -> { env: { KEY: "val", … } }
 *   POST /applications/env?application=<id>            merge + bump ConfigRevision
 *        body: { "set": { KEY: "val" }, "remove": ["KEY"] }
 *
 * Auth: X-BEA-Session-Token or `Authorization: Bearer roxp_…` (scope `deploy`).
 * PORT and HOST are platform-managed and silently dropped. The next deploy
 * applies the change.
 */
class ApplicationEnv
{
    private const APPID_RE = '/^[A-Za-z0-9]{1,40}$/';
    private const KEY_RE   = '/^[A-Za-z_][A-Za-z0-9_]*$/';

    public function __construct(
        private $server,
        private array $config,
    ) {
    }

    public function handle($req, $res, array $nodes, $data): void
    {
        $res->header('Content-Type', 'application/json');

        $who = apiCaller($this->server, $req, 'deploy');
        if ($who === null) {
            $this->fail($res, 401, 'Not signed in');
            return;
        }
        if (isset($who['denied'])) {
            $this->fail($res, 403, 'This access token does not have the "' . $who['denied'] . '" scope');
            return;
        }

        $appId = trim((string) ($req->get['application'] ?? ''));
        if (preg_match(self::APPID_RE, $appId) !== 1) {
            $this->fail($res, 400, 'An application id is required (?application=<id>)');
            return;
        }

        $app = $this->one('/Applications', [
            'fields' => 'objectId,Subscription,Env,ConfigRevision',
            'limit'  => 1,
            'where'  => ['objectId' => $appId],
        ]);
        $subId = (string) ($app->Subscription ?? '');
        if ($app === null || $subId === '' || !in_array($subId, $who['subs'], true)) {
            $this->fail($res, 404, 'Application not found');
            return;
        }

        $env = json_decode((string) ($app->Env ?? '{}'), true);
        if (!is_array($env)) $env = [];

        $method = strtoupper((string) ($req->server['request_method'] ?? 'GET'));
        if ($method === 'GET') {
            $this->ok($res, ['env' => (object) $env]);
            return;
        }
        if ($method !== 'POST') {
            $this->fail($res, 405, 'Method not allowed');
            return;
        }

        $body   = $this->body($data);
        $set    = is_array($body['set'] ?? null) ? $body['set'] : [];
        $remove = is_array($body['remove'] ?? null) ? $body['remove'] : [];
        $changed = [];

        foreach ($set as $k => $v) {
            $k = (string) $k;
            if ($k === 'PORT' || $k === 'HOST') continue;
            if (preg_match(self::KEY_RE, $k) !== 1) {
                $this->fail($res, 400, 'Invalid environment variable name: ' . $k);
                return;
            }
            $env[$k] = str_replace(["\r", "\n"], '', (string) $v);
            $changed[] = $k;
        }
        foreach ($remove as $k) {
            $k = (string) $k;
            if (array_key_exists($k, $env)) {
                unset($env[$k]);
                $changed[] = '-' . $k;
            }
        }

        $rev = (int) ($app->ConfigRevision ?? 0);
        try {
            $put = $this->server->rx->put('/Applications/' . $appId, [
                'Env'            => json_encode((object) $env),
                'ConfigRevision' => $rev + 1,
            ]);
            if ($this->apiError($put) !== '') throw new \RuntimeException($this->apiError($put));
        } catch (\Throwable $e) {
            error_log('[appenv] ' . $appId . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not save the environment');
            return;
        }

        $this->ok($res, [
            'env'            => (object) $env,
            'changed'        => $changed,
            'configRevision' => $rev + 1,
        ]);
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

    private function one(string $path, array $q): ?object
    {
        try {
            $r    = $this->server->rx->get($path, $q);
            $rows = is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []);
            $row  = $rows[0] ?? null;
            return is_array($row) ? (object) $row : $row;
        } catch (\Throwable $e) {
            error_log('[appenv] query ' . $path . ': ' . $e->getMessage());
            return null;
        }
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
