<?php

/**
 * ApplicationDeploy — console side, takes a source tarball from the CLI / MCP
 * server and lands it in the application's SourcePath, then bumps ConfigRevision
 * so the reconciler builds and releases it exactly as it does for a git push.
 *
 * Route:  POST /applications/deploy?application=<id>
 *         POST /applications/deploy?host=<domain>&folder=<f>&runtime=<r>&…   (first deploy)
 * Body:   raw gzip tarball (Content-Type: application/gzip). The archive is the
 *         project tree the customer wants deployed, already minus node_modules /
 *         .git / build caches (the client strips those).
 * Auth:   X-BEA-Session-Token, or `Authorization: Bearer roxp_…` (a Personal
 *         Access Token with the `deploy` scope). The caller must hold a
 *         privilege on the application's / host's subscription.
 *
 * When `application` is omitted, `host` + `folder` + `runtime` create the
 * Applications / ApplicationProcesses / ApplicationRoutes rows first (so a CI
 * job with only a PAT can deploy a brand-new app in one call), then deploy.
 *
 * WHY A TARBALL AND NOT SFTP
 * -------------------------
 * SFTP would mean handing every developer (and every CI job) the container's
 * shell credentials. This endpoint is scoped to one application the caller
 * already owns, the upload only ever lands inside that application's SourcePath,
 * and the build still happens in an isolated release dir — same as today.
 *
 * WHY NOT EXTRACT ON THE CONSOLE
 * -----------------------------
 * The container lives on exactly one app node and the console is load-balanced
 * across all of them. app-source-apply.sh runs where the container is (over ssh
 * when that is elsewhere) — the same hop ApplicationLogs uses.
 *
 * WHY REPO-CONNECTED APPS ARE REJECTED
 * -----------------------------------
 * A git-connected app's source of truth is the branch. Letting a tarball
 * overwrite it would silently diverge the running release from the repo. Those
 * apps deploy by pushing.
 */
class ApplicationDeploy
{
    private const APPID_RE   = '/^[A-Za-z0-9]{1,40}$/';
    private const HOST_RE    = '/^[a-z0-9.-]{1,253}$/';
    private const FOLDER_RE  = '#^[A-Za-z0-9._/-]{0,200}$#';
    private const MAX_BYTES  = 64 * 1024 * 1024;
    private const GZIP_MAGIC = "\x1f\x8b";
    private const RUNTIMES   = ['node', 'python', 'php'];

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

        // --- who is calling ----------------------------------------------------
        $who = apiCaller($this->server, $req, 'deploy');
        if ($who === null) {
            $this->fail($res, 401, 'Not signed in (session token or a Bearer PAT is required)');
            return;
        }
        if (isset($who['denied'])) {
            $this->fail($res, 403, 'This access token does not have the "' . $who['denied'] . '" scope');
            return;
        }

        // --- the archive -----------------------------------------------------
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

        // --- resolve or create the application ----------------------------
        $appId = trim((string) ($req->get['application'] ?? $req->get['applicationId'] ?? ''));
        $created = false;

        if ($appId === '') {
            $app = $this->createApp($req, $who);
            if (is_string($app)) {
                $this->fail($res, 400, $app);
                return;
            }
            if ($app === null) {
                $this->fail($res, 404, 'That host is not on your account');
                return;
            }
            $created = true;
        } else {
            if (preg_match(self::APPID_RE, $appId) !== 1) {
                $this->fail($res, 400, 'Invalid application id');
                return;
            }
            $app = $this->one('/Applications', [
                'fields' => 'objectId,Name,Subscription,SourcePath,RepoUrl,DesiredState,ConfigRevision',
                'limit'  => 1,
                'where'  => ['objectId' => $appId],
            ]);
        }

        $appId = (string) ($app->objectId ?? $appId);
        $subId = (string) ($app->Subscription ?? '');

        // Same answer for "not yours" and "does not exist" — ids cannot be walked.
        if ($app === null || $subId === '' || !in_array($subId, $who['subs'], true)) {
            $this->fail($res, 404, 'Application not found');
            return;
        }

        if (trim((string) ($app->RepoUrl ?? '')) !== '') {
            $this->fail($res, 409, 'This application deploys from git — push to the connected branch instead.');
            return;
        }
        if ((string) ($app->DesiredState ?? 'running') !== 'running') {
            $this->fail($res, 409, 'Start the application first');
            return;
        }

        $sourcePath = (string) ($app->SourcePath ?? '');
        if (strncmp($sourcePath, '/home/www/', 10) !== 0 || str_contains($sourcePath, '..')) {
            $this->fail($res, 500, 'The application has no valid source path');
            return;
        }

        // --- which node holds the container --------------------------------
        $sub = $this->one('/Subscriptions', [
            'fields' => 'objectId,Username,Node',
            'limit'  => 1,
            'where'  => ['objectId' => $subId],
        ]);
        $container = (string) ($sub->Username ?? '');
        $nodeId    = (string) ($sub->Node ?? '');
        if ($container === '') {
            $this->fail($res, 503, 'The application host is unavailable');
            return;
        }

        $isLocal = $nodeId !== '' && $nodeId === (string) ($this->config['node']['objectId'] ?? '');
        $nodeIp  = '';
        if (!$isLocal) {
            $node   = $this->one('/Nodes', [
                'fields' => 'objectId,Name,PrivateIP',
                'limit'  => 1,
                'where'  => ['objectId' => $nodeId],
            ]);
            $nodeIp = (string) ($node->PrivateIP ?? '');
            if ($nodeIp === '') {
                $this->fail($res, 503, 'The application host is unavailable');
                return;
            }
        }

        // --- hand the archive to the node ---------------------------------
        $tmp = tempnam(sys_get_temp_dir(), 'rxsrc_');
        if ($tmp === false || file_put_contents($tmp, $blob) === false) {
            @unlink($tmp);
            $this->fail($res, 500, 'Could not stage the upload');
            return;
        }
        @chmod($tmp, 0600);

        $inner = '/usr/local/bin/app-source-apply.sh '
               . escapeshellarg($container) . ' '
               . escapeshellarg($container) . ' '
               . escapeshellarg($sourcePath);

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
            error_log('[appdeploy] ' . $appId . ' apply failed (' . $code . '): ' . substr($out, -400));
            $this->fail($res, 502, 'Could not unpack the upload onto the application host');
            return;
        }

        $files = 0;
        if (preg_match('/^RX_FILES=(\d+)$/m', $out, $m)) {
            $files = (int) $m[1];
        }

        // --- bump ConfigRevision -> reconciler builds + releases ----------
        $rev = (int) ($app->ConfigRevision ?? 0);
        try {
            $put = $this->server->rx->put('/Applications/' . $appId, ['ConfigRevision' => $rev + 1]);
            if ($this->apiError($put) !== '') {
                throw new \RuntimeException($this->apiError($put));
            }
        } catch (\Throwable $e) {
            error_log('[appdeploy] ' . $appId . ' revision bump: ' . $e->getMessage());
            $this->fail($res, 502, 'The upload landed but the build could not be queued — press Deploy in the console.');
            return;
        }

        $this->ok($res, [
            'application'    => $appId,
            'created'        => $created,
            'configRevision' => $rev + 1,
            'files'          => $files,
            'bytes'          => strlen($blob),
        ]);
    }

    // ------------------------------------------------------------------ helpers

    /**
     * First deploy: create the Applications + web ApplicationProcesses + "/"
     * ApplicationRoutes rows from the query params, the same three writes the
     * console's New Application form makes. Returns the new app object, `null`
     * when the host is not the caller's, or a string error message.
     *
     * @return object|string|null
     */
    private function createApp($req, array $who)
    {
        $host    = strtolower(trim((string) ($req->get['host'] ?? '')));
        $folder  = trim((string) ($req->get['folder'] ?? ''), '/');
        $runtime = strtolower(trim((string) ($req->get['runtime'] ?? 'node')));
        $version = trim((string) ($req->get['runtimeVersion'] ?? ''));
        $preset  = trim((string) ($req->get['preset'] ?? $runtime));
        $command = trim((string) ($req->get['command'] ?? ''));
        $public  = in_array(strtolower((string) ($req->get['public'] ?? '1')), ['1', 'true', 'yes'], true);

        if (preg_match(self::HOST_RE, $host) !== 1) {
            return 'A host is required to create an application (?host=<domain>)';
        }
        if ($folder !== '' && (preg_match(self::FOLDER_RE, $folder) !== 1 || str_contains($folder, '..'))) {
            return 'Invalid folder';
        }
        if (!in_array($runtime, self::RUNTIMES, true)) {
            return 'runtime must be one of: ' . implode(', ', self::RUNTIMES);
        }

        $dom = $this->one('/Domains', [
            'fields' => 'objectId,Name,Subscription',
            'limit'  => 1,
            'where'  => ['Name' => $host, 'eye' => ['in' => '1,0']],
        ]);
        $subId  = (string) ($dom->Subscription ?? '');
        $domId  = (string) ($dom->objectId ?? '');
        if ($dom === null || $subId === '' || !in_array($subId, $who['subs'], true)) {
            return null;
        }

        $source = '/home/www/' . $host . '/public_html' . ($folder !== '' ? '/' . $folder : '');
        $name   = $folder !== '' ? $folder : $host;

        $mk = $this->server->rx->post('/Applications', [
            'Subscription'    => $subId,
            'Name'            => $name,
            'Preset'          => $preset,
            'SourcePath'      => $source,
            'Runtime'         => $runtime,
            'RuntimeVersion'  => $version !== '' ? $version : '',
            'Env'             => '{}',
            'Status'          => 'pending',
            'DesiredState'    => 'running',
            'ConfigRevision'  => 0,
            'AppliedRevision' => 0,
            'LastError'       => '',
        ]);
        if ($this->apiError($mk) !== '') {
            return 'Could not create the application: ' . $this->apiError($mk);
        }
        $newId = (string) ($this->firstId($mk));
        if ($newId === '') {
            return 'Could not create the application';
        }

        $this->server->rx->post('/ApplicationProcesses', [
            'Application' => $newId,
            'Type'        => 'web',
            'Port'        => 0,
            'Command'     => $command !== '' ? $command : 'npm run start',
            'Status'      => 'pending',
        ]);
        $this->server->rx->post('/ApplicationRoutes', [
            'Application' => $newId,
            'Domain'      => $domId,
            'Path'        => '/',
            'Enabled'     => $public ? 1 : 0,
        ]);

        return (object) [
            'objectId'       => $newId,
            'Subscription'   => $subId,
            'SourcePath'     => $source,
            'RepoUrl'        => '',
            'DesiredState'   => 'running',
            'ConfigRevision' => 0,
        ];
    }

    private function firstId($r): string
    {
        if (is_object($r)) $r = (array) $r;
        $rows = is_array($r) ? ($r['results'] ?? []) : [];
        $row  = $rows[0] ?? null;
        $row  = is_object($row) ? (array) $row : $row;
        return is_array($row) ? (string) ($row['objectId'] ?? '') : '';
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

    private function one(string $path, array $q): ?object
    {
        try {
            $r    = $this->server->rx->get($path, $q);
            $rows = is_object($r) ? ($r->results ?? []) : ($r['results'] ?? []);
            $row  = $rows[0] ?? null;
            return is_array($row) ? (object) $row : $row;
        } catch (\Throwable $e) {
            error_log('[appdeploy] query ' . $path . ': ' . $e->getMessage());
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
