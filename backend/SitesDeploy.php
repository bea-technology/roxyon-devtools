<?php
/**
 * libs/SitesDeploy.php  —  POST /sites/deploy
 *
 * Reference implementation — see backend/README.md. Static-site upload: extract
 * built files into a host's document root. No Application row, no reconciler.
 *
 * Contract: backend/sites-deploy.md
 */

class SitesDeploy
{
    const MAX_BYTES   = 512 * 1024 * 1024;
    const MAX_ENTRIES = 20000;

    public static function handle($req): array
    {
        $user = wsIdentify($req);
        if (!$user) {
            return ['ok' => false, 'error' => 'Not signed in.'];
        }

        $host    = trim($req->post['host'] ?? '');
        $folder  = trim($req->post['folder'] ?? '');
        $clean   = ($req->post['clean'] ?? '') === '1';
        $tmpFile = $req->files['archive']['tmp_name'] ?? '';
        if ($host === '' || $tmpFile === '' || !is_file($tmpFile)) {
            return ['ok' => false, 'error' => 'host and archive are required.'];
        }

        // normalise folder — no traversal, no absolute
        $folder = trim(str_replace('\\', '/', $folder), '/');
        if ($folder !== '' && preg_match('#(^|/)\.\.(/|$)#', $folder)) {
            return ['ok' => false, 'error' => 'Invalid folder.'];
        }

        $domain = baas()->get('/Domains', [
            'where'  => ['Name' => $host],
            'fields' => 'objectId,Name,Subscription',
            'limit'  => 1,
        ])['results'][0] ?? null;
        if (!$domain) {
            return ['ok' => false, 'error' => 'Host not found.'];
        }
        if (!userOwnsSubscription($user, $domain['Subscription'])) {
            return ['ok' => false, 'error' => 'You do not have access to this host.'];
        }

        $err = ApplicationDeploy::validateArchive($tmpFile);   // reuse the same checks
        if ($err) {
            return ['ok' => false, 'error' => $err];
        }

        $sub = baas()->get('/Subscriptions', [
            'where'  => ['objectId' => $domain['Subscription']],
            'fields' => 'objectId,Node,Username',
            'limit'  => 1,
        ])['results'][0] ?? null;
        if (!$sub || empty($sub['Node'])) {
            return ['ok' => false, 'error' => 'Could not resolve the subscription node.'];
        }

        $node      = $sub['Node'];
        $container = $sub['Username'];
        $dest      = '/home/www/' . $host . '/public_html' . ($folder !== '' ? '/' . $folder : '');

        $remoteTmp = '/tmp/rxsite-' . bin2hex(random_bytes(6)) . '.tar.gz';
        nodePut($node, $tmpFile, $remoteTmp);
        nodeSh($node, sprintf('incus file push %s %s/%s',
            escapeshellarg($remoteTmp), escapeshellarg($container), ltrim($remoteTmp, '/')));

        $script = file_get_contents(__DIR__ . '/../scripts/app-source-apply.sh');
        $applyArgs = escapeshellarg($dest) . ' ' . escapeshellarg($remoteTmp);
        $out = nodeSh($node, sprintf(
            'printf %s | incus exec %s -- su %s -c %s',
            escapeshellarg($script),
            escapeshellarg($container), escapeshellarg($container),
            escapeshellarg('bash -s -- ' . $applyArgs)
        ));

        if ($clean) {
            // delete files under $dest not present in the archive
            $out .= "\n" . nodeSh($node, sprintf(
                'incus exec %s -- su %s -c %s',
                escapeshellarg($container), escapeshellarg($container),
                escapeshellarg(self::cleanScript($dest, $remoteTmp))
            ));
        }

        nodeSh($node, 'rm -f ' . escapeshellarg($remoteTmp));
        nodeSh($node, sprintf('incus exec %s -- rm -f %s',
            escapeshellarg($container), escapeshellarg($remoteTmp)));

        if (strpos($out, 'RX_SOURCE_APPLIED=') === false) {
            return ['ok' => false, 'error' => 'Could not apply the upload: ' . substr(trim($out), -400)];
        }
        preg_match('/RX_SOURCE_APPLIED=(\d+)/', $out, $m);

        return ['ok' => true, 'host' => $host, 'path' => '/' . $folder, 'files' => (int)($m[1] ?? 0)];
    }

    private static function cleanScript(string $dest, string $tarball): string
    {
        // keep = entries in the tarball; delete everything else under $dest
        return 'set -e; cd ' . escapeshellarg($dest) . '; '
             . 'keep=$(tar -tzf ' . escapeshellarg($tarball) . " | sed 's#/\$##'); "
             . 'find . -type f | sed "s#^\./##" | while read f; do '
             . 'echo "$keep" | grep -qxF "$f" || rm -f "$f"; done';
    }
}
