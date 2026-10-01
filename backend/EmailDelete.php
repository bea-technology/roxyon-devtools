<?php

/**
 * EmailDelete — the inverse of EmailCreate.php.
 *
 *   POST /emails/delete
 *        body: { email }   // objectId from EmailCreate's response
 *        -> { objectId, status }
 *
 * Auth: same as EmailCreate. Flips `Emails.Status` to `deleted`; the
 * already-live `pollEmails()` -> `handleEmailDelete()` reconciler (unchanged)
 * hard-deletes the row itself once the `email_management` cleanup is done —
 * this endpoint only queues that.
 */
class EmailDelete
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

        $b      = $this->body($data);
        $emailId = trim((string) ($b['email'] ?? ''));
        if ($emailId === '') {
            $this->fail($res, 400, 'Pass "email" (the objectId from email create).');
            return;
        }

        $row = $this->one('/Emails', [
            'fields' => 'objectId,Email,Status,Subscription',
            'limit'  => 1,
            'where'  => ['objectId' => $emailId, 'eye' => ['in' => '1,0']],
        ]);
        if (!$row) {
            $this->fail($res, 404, 'Mailbox not found');
            return;
        }
        if (!in_array((string) ($row->Subscription ?? ''), $who['subs'], true)) {
            $this->fail($res, 403, 'That mailbox is not on your account');
            return;
        }

        try {
            $this->server->rx->put("/Emails/{$emailId}", ['Status' => 'deleted']);
        } catch (\Throwable $e) {
            error_log('[emaildelete] ' . $emailId . ': ' . $e->getMessage());
            $this->fail($res, 502, 'Could not queue the deletion');
            return;
        }

        // handleEmailDelete() hard-deletes the row on success — "not found" IS
        // the success state here, not an error.
        $status = 'deleting';
        $deadline = microtime(true) + self::POLL_SECONDS;
        while (microtime(true) < $deadline) {
            usleep(1_500_000);
            $r = $this->one('/Emails', [
                'fields' => 'objectId,Status',
                'limit'  => 1,
                'where'  => ['objectId' => $emailId],
            ]);
            if (!$r) {
                $status = 'deleted';
                break;
            }
            $s = strtolower((string) ($r->Status ?? ''));
            if ($s === 'failed') {
                $status = 'failed';
                break;
            }
        }

        $this->ok($res, ['objectId' => $emailId, 'status' => $status]);
    }

    // -- helpers (mirror EmailCreate.php) ----------------------------------

    private function one(string $path, array $q): ?object
    {
        try {
            $r    = $this->server->rx->get($path, $q);
            $rows = is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []);
            $row  = $rows[0] ?? null;
            return is_array($row) ? (object) $row : $row;
        } catch (\Throwable $e) {
            error_log('[emaildelete] query ' . $path . ': ' . $e->getMessage());
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
