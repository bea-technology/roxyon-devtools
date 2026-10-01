<?php

/**
 * DatabaseDelete — the inverse of DatabaseCreate.php.
 *
 *   POST /databases/delete
 *        body: { database }   // objectId from DatabaseCreate's response
 *        -> { objectId, status }
 *
 * Auth: same as DatabaseCreate. Flips `Databases.Status` to `deleted`; the
 * already-live `pollDBs()` reconciler (unchanged) picks it up from there —
 * this endpoint does not touch Galera or the worker directly.
 */
class DatabaseDelete
{
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

        $b     = $this->body($data);
        $dbId  = trim((string) ($b['database'] ?? ''));
        if ($dbId === '') {
            $this->fail($res, 400, 'Pass "database" (the objectId from database create).');
            return;
        }

        $row = $this->one('/Databases', [
            'fields' => 'objectId,Name,Status,Subscription',
            'limit'  => 1,
            'where'  => ['objectId' => $dbId, 'eye' => ['in' => '1,0']],
        ]);
        if (!$row) {
            $this->fail($res, 404, 'Database not found');
            return;
        }
        if (!in_array((string) ($row->Subscription ?? ''), $who['subs'], true)) {
            $this->fail($res, 403, 'That database is not on your account');
            return;
        }
        if (strtolower((string) $row->Status) === 'deleted') {
            $this->ok($res, ['objectId' => $dbId, 'status' => 'deleted']);
            return;
        }

        try {
            $this->server->rx->put("/Databases/{$dbId}", ['Status' => 'deleted']);
        } catch (\Throwable $e) {
            error_log('[databasedelete] ' . $dbId . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not queue the deletion');
            return;
        }

        // Either the reconciler flips Status again, or (some resources, e.g.
        // Emails) hard-deletes the row outright — either is "gone" from here.
        $status = 'deleting';
        $deadline = microtime(true) + self::POLL_SECONDS;
        while (microtime(true) < $deadline) {
            usleep(1_500_000);
            $r = $this->one('/Databases', [
                'fields' => 'objectId,Status',
                'limit'  => 1,
                'where'  => ['objectId' => $dbId],
            ]);
            if (!$r) {
                $status = 'deleted';
                break;
            }
            $s = strtolower((string) ($r->Status ?? ''));
            if ($s === 'deleted') {
                $status = 'deleted';
                break;
            }
            if ($s === 'failed') {
                $status = 'failed';
                break;
            }
        }

        $this->ok($res, ['objectId' => $dbId, 'status' => $status]);
    }

    // -- helpers (mirror DatabaseCreate.php) --------------------------------

    private function one(string $path, array $q): ?object
    {
        try {
            $r    = $this->server->rx->get($path, $q);
            $rows = is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []);
            $row  = $rows[0] ?? null;
            return is_array($row) ? (object) $row : $row;
        } catch (\Throwable $e) {
            error_log('[databasedelete] query ' . $path . ': ' . $e->getMessage());
            return null;
        }
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
