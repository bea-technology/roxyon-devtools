<?php

/**
 * AccountContext — everything the roxyon CLI / MCP server needs to plan a
 * deploy, in one call, resolvable by a Personal Access Token (so a CI job with
 * only a PAT never has to touch the BaaS).
 *
 *   GET /account/context   ->  { user, subscriptions[], domains[] }
 *
 * Auth: X-BEA-Session-Token, or `Authorization: Bearer roxp_…` (any scope).
 */
class AccountContext
{
    public function __construct(
        private $server,
        private array $config,
    ) {
    }

    public function handle($req, $res, array $nodes, $data): void
    {
        $res->header('Content-Type', 'application/json');

        $who = apiCaller($this->server, $req, 'read');
        if ($who === null) {
            $this->fail($res, 401, 'Not signed in');
            return;
        }
        if (isset($who['denied'])) {
            $this->fail($res, 403, 'This access token does not have the "' . $who['denied'] . '" scope');
            return;
        }

        $user = $this->one('/Users', [
            'fields' => 'objectId,Email,Username',
            'limit'  => 1,
            'where'  => ['objectId' => $who['uid']],
        ]);

        $subs = [];
        if ($who['subs']) {
            $subs = $this->many('/Subscriptions', [
                'fields' => 'objectId,Name,Status,Node,Datacenter,Username',
                'limit'  => -1,
                'where'  => ['objectId' => ['in' => implode(',', $who['subs'])]],
            ]);
        }

        $domains = [];
        if ($who['subs']) {
            $domains = $this->many('/Domains', [
                'fields' => 'objectId,Name,Subscription',
                'limit'  => -1,
                'order'  => 'Name',
                'where'  => ['Subscription' => ['in' => implode(',', $who['subs'])], 'eye' => ['in' => '1,0']],
            ]);
        }

        $this->ok($res, [
            'user' => [
                'id'    => (string) ($user->objectId ?? $who['uid']),
                'email' => (string) ($user->Email ?? ''),
            ],
            'scopes' => $who['scopes'],
            'subscriptions' => array_map(fn($s) => [
                'id'         => (string) ($s->objectId ?? ''),
                'name'       => (string) ($s->Name ?? ''),
                'status'     => (string) ($s->Status ?? ''),
                'node'       => (string) ($s->Node ?? ''),
                'datacenter' => (string) ($s->Datacenter ?? ''),
                'container'  => (string) ($s->Username ?? ''),
            ], $subs),
            'domains' => array_map(fn($d) => [
                'id'           => (string) ($d->objectId ?? ''),
                'name'         => (string) ($d->Name ?? ''),
                'subscription' => (string) ($d->Subscription ?? ''),
            ], $domains),
        ]);
    }

    private function one(string $path, array $q): ?object
    {
        $rows = $this->many($path, $q);
        return $rows[0] ?? null;
    }

    /** @return array<int,object> */
    private function many(string $path, array $q): array
    {
        try {
            $r    = $this->server->rx->get($path, $q);
            $rows = is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []);
            $out  = [];
            foreach ($rows as $row) {
                $out[] = is_array($row) ? (object) $row : $row;
            }
            return $out;
        } catch (\Throwable $e) {
            error_log('[acctctx] query ' . $path . ': ' . $e->getMessage());
            return [];
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
