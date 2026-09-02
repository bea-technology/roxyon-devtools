<?php
/**
 * libs/ApplicationDeploy.php  —  POST /applications/deploy
 *
 * Reference implementation. Adapt the helper names (wsIdentify, node(), sh(),
 * incusExec, baas(), …) to the console's actual `libs/` conventions — see
 * libs/ApplicationAction.php and libs/ApplicationRepo.php for the real ones.
 *
 * Contract: backend/applications-deploy.md
 */

class ApplicationDeploy
{
    const MAX_BYTES   = 512 * 1024 * 1024;
    const MAX_ENTRIES = 20000;

    /** @param array $req  Swoole request (headers, files, post) */
    public static function handle($req): array
    {
        // 1. auth ------------------------------------------------------------
        $user = wsIdentify($req);                       // TODO console helper
        if (!$user) {
            return ['ok' => false, 'error' => 'Not signed in.'];
        }

        $appId   = trim($req->post['application'] ?? '');
        $tmpFile = $req->files['archive']['tmp_name'] ?? '';
        if ($appId === '' || $tmpFile === '' || !is_file($tmpFile)) {
            return ['ok' => false, 'error' => 'application and archive are required.'];
        }

        // 2. load + ownership ---------------------------------------------------
        $app = baas()->get('/Applications', [
            'where'  => ['objectId' => $appId],
            'fields' => 'objectId,Name,SourcePath,Subscription,RepoUrl,ConfigRevision',
            'limit'  => 1,
        ])['results'][0] ?? null;
        if (!$app) {
            return ['ok' => false, 'error' => 'Application not found.'];
        }
        if (!userOwnsSubscription($user, $app['Subscription'])) {   // TODO helper
            return ['ok' => false, 'error' => 'You do not have access to this application.'];
        }
        if (!empty($app['RepoUrl'])) {
            return ['ok' => false, 'error' =>
                'This application deploys from its git remote — push to redeploy, '
                . 'or disconnect the repo first.'];
        }

        // 3. validate the archive -------------------------------------------
        $err = self::validateArchive($tmpFile);
        if ($err) {
            return ['ok' => false, 'error' => $err];
        }

        // 4. resolve the node + container ---------------------------------------
        $sub = baas()->get('/Subscriptions', [
            'where'  => ['objectId' => $app['Subscription']],
            'fields' => 'objectId,Node,Username',
            'limit'  => 1,
        ])['results'][0] ?? null;
        if (!$sub || empty($sub['Node'])) {
            return ['ok' => false, 'error' => 'Could not resolve the subscription node.'];
        }
        $node      = $sub['Node'];
        $container = $sub['Username'];
        $srcPath   = $app['SourcePath'];

        if (strpos($srcPath, '/home/www/') !== 0 || strpos($srcPath, '/public_html') === false) {
            return ['ok' => false, 'error' => 'Application has an unexpected source path.'];
        }

        // 5. ship the tarball to the node + into the container, then apply ----
        $remoteTmp = '/tmp/rxdeploy-' . bin2hex(random_bytes(6)) . '.tar.gz';
        nodePut($node, $tmpFile, $remoteTmp);                       // scp / rsync to the node
        nodeSh($node, sprintf(
            'incus file push %s %s/%s',
            escapeshellarg($remoteTmp),
            escapeshellarg($container),
            ltrim($remoteTmp, '/')
        ));

        $script = file_get_contents(__DIR__ . '/../scripts/app-source-apply.sh');
        $out = nodeSh($node, sprintf(
            'incus exec %s -- su %s -c %s < /dev/null; '
            . 'printf %s | incus exec %s -- su %s -c %s',
            escapeshellarg($container), escapeshellarg($container), escapeshellarg('true'),
            escapeshellarg($script),
            escapeshellarg($container), escapeshellarg($container),
            escapeshellarg('bash -s -- ' . escapeshellarg($srcPath) . ' ' . escapeshellarg($remoteTmp))
        ));

        nodeSh($node, 'rm -f ' . escapeshellarg($remoteTmp));
        nodeSh($node, sprintf('incus exec %s -- rm -f %s',
            escapeshellarg($container), escapeshellarg($remoteTmp)));

        if (strpos($out, 'RX_SOURCE_APPLIED=') === false) {
            return ['ok' => false, 'error' => 'Could not apply the uploaded source: '
                . self::tail($out)];
        }

        // 6. bump ConfigRevision -> the reconciler builds it ---------------
        $next = (int)($app['ConfigRevision'] ?? 0) + 1;
        $w = baas()->put('/Applications', [
            'objectId'      => $appId,
            'ConfigRevision'=> $next,
        ]);
        if ($msg = rxError($w)) {                                   // resolve-on-failure!
            return ['ok' => false, 'error' => 'Uploaded, but could not queue the build: ' . $msg];
        }

        return ['ok' => true, 'application' => $appId, 'configRevision' => $next];
    }

    private static function validateArchive(string $path): ?string
    {
        if (filesize($path) > self::MAX_BYTES) {
            return 'Archive is larger than 512 MB.';
        }
        $fh = fopen($path, 'rb');
        $magic = fread($fh, 2);
        fclose($fh);
        if (bin2hex($magic) !== '1f8b') {
            return 'Archive is not a gzip tarball.';
        }
        // Entry scan (uses PharData or a piped `tar -tz`); reject traversal.
        $list = [];
        exec('tar -tzf ' . escapeshellarg($path) . ' 2>/dev/null', $list, $rc);
        if ($rc !== 0) {
            return 'Archive could not be read.';
        }
        if (count($list) > self::MAX_ENTRIES) {
            return 'Archive has too many files.';
        }
        foreach ($list as $entry) {
            if ($entry === '' || $entry[0] === '/' ||
                preg_match('#(^|/)\.\.(/|$)#', $entry)) {
                return 'Archive contains an unsafe path: ' . $entry;
            }
        }
        return null;
    }

    private static function tail(string $s, int $n = 400): string
    {
        return substr(trim($s), -$n);
    }
}
