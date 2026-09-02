<?php

/**
 * SiteDeploy — console side, publishes a static site (a LumenJS serverless
 * build, or any static output) straight into a host's document root.
 *
 * Route:  POST /sites/deploy?host=<domain>&folder=<sub-path>
 * Body:   raw gzip tarball (Content-Type: application/gzip)
 * Auth:   X-BEA-Session-Token; the caller must own the domain (a Domains row on
 *         one of their subscriptions).
 *
 * There is no build and no process — nginx serves the files. `folder` is an
 * optional sub-path under `public_html` ("" = the site root). The upload is
 * overlaid onto whatever is there; it does not delete files the archive omits.
 */
class SiteDeploy
{
    private const HOST_RE    = '/^[a-z0-9.-]{1,253}$/';
    private const FOLDER_RE  = '#^[A-Za-z0-9._/-]{0,200}$#';
    private const MAX_BYTES  = 64 * 1024 * 1024;
    private const GZIP_MAGIC = "\x1f\x8b";

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

        $host   = strtolower(trim((string) ($req->get['host'] ?? '')));
        $folder = trim((string) ($req->get['folder'] ?? ''), '/');

        if (preg_match(self::HOST_RE, $host) !== 1) {
            $this->fail($res, 400, 'A host is required (?host=<domain>)');
            return;
        }
        if ($folder !== '' && (preg_match(self::FOLDER_RE, $folder) !== 1 || str_contains($folder, '..'))) {
            $this->fail($res, 400, 'Invalid folder');
            return;
        }

        $blob = (string) $req->rawContent();
        if ($blob === '') {
            $this->fail($res, 400, 'Empty request body — expected a gzip tarball');
            return;
        }
        if (strlen($blob) > self::MAX_BYTES) {
            $this->fail($res, 413, 'Archive too large (limit ' . (self::MAX_BYTES >> 20) . ' MB)');
            return;
        }
        if (substr($blob, 0, 2) !== self::GZIP_MAGIC) {
            $this->fail($res, 400, 'Body is not a gzip archive');
            return;
        }

        // --- domain ownership -> subscription -----------------------------
        $dom = sslOwnedDomain($this->server, $host, $who);
        if (!$dom) {
            $this->fail($res, 404, 'That host is not on your account');
            return;
        }
        $subId = is_object($dom) ? (string) ($dom->Subscription ?? '') : (string) ($dom['Subscription'] ?? '');

        $sub = $this->one('/Subscriptions', [
            'fields' => 'objectId,Username,Node',
            'limit'  => 1,
            'where'  => ['objectId' => $subId],
        ]);
        $container = (string) ($sub->Username ?? '');
        $nodeId    = (string) ($sub->Node ?? '');
        if ($container === '') {
            $this->fail($res, 503, 'The site host is unavailable');
            return;
        }

        $dest = '/home/www/' . $host . '/public_html' . ($folder !== '' ? '/' . $folder : '');

        $isLocal = $nodeId !== '' && $nodeId === (string) ($this->config['node']['objectId'] ?? '');
        $nodeIp  = '';
        if (!$isLocal) {
            $node   = $this->one('/Nodes', [
                'fields' => 'objectId,PrivateIP',
                'limit'  => 1,
                'where'  => ['objectId' => $nodeId],
            ]);
            $nodeIp = (string) ($node->PrivateIP ?? '');
            if ($nodeIp === '') {
                $this->fail($res, 503, 'The site host is unavailable');
                return;
            }
        }

        $tmp = tempnam(sys_get_temp_dir(), 'rxsite_');
        if ($tmp === false || file_put_contents($tmp, $blob) === false) {
            @unlink($tmp);
            $this->fail($res, 500, 'Could not stage the upload');
            return;
        }
        @chmod($tmp, 0600);

        $inner = '/usr/local/bin/app-source-apply.sh '
               . escapeshellarg($container) . ' '
               . escapeshellarg($container) . ' '
               . escapeshellarg($dest);

        $cmd = $isLocal
            ? $inner . ' < ' . escapeshellarg($tmp)
            : 'ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=8 root@'
                . escapeshellarg($nodeIp) . ' ' . escapeshellarg($inner)
                . ' < ' . escapeshellarg($tmp);

        try {
            $r    = \Swoole\Coroutine\System::exec('timeout 120 bash -c ' . escapeshellarg($cmd));
            $out  = trim((string) ($r['output'] ?? ''));
            $code = (int) ($r['code'] ?? 1);
        } finally {
            @unlink($tmp);
        }

        if ($code !== 0) {
            error_log('[sitedeploy] ' . $host . ' apply failed (' . $code . '): ' . substr($out, -400));
            $this->fail($res, 502, 'Could not publish the site');
            return;
        }

        $files = 0;
        if (preg_match('/^RX_FILES=(\d+)$/m', $out, $m)) {
            $files = (int) $m[1];
        }

        $this->ok($res, [
            'host'  => $host,
            'path'  => $folder !== '' ? '/' . $folder : '/',
            'files' => $files,
            'bytes' => strlen($blob),
        ]);
    }

    private function one(string $path, array $q): ?object
    {
        try {
            $r    = $this->server->rx->get($path, $q);
            $rows = is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []);
            $row  = $rows[0] ?? null;
            return is_array($row) ? (object) $row : $row;
        } catch (\Throwable $e) {
            error_log('[sitedeploy] query ' . $path . ': ' . $e->getMessage());
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
