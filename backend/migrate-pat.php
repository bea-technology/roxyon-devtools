<?php
/**
 * One-shot schema migration: the PersonalAccessTokens class for the roxyon CLI.
 *
 *   php /var/www/console/exec/migrate-pat.php
 *
 * Idempotent — creating a class that exists is a no-op, and createFields skips
 * columns that already exist. Talks to the node's BaaS (private IP :9000). The
 * App-ID + REST key are read from /var/www/console/libs/server_setup.php on the
 * node (or from BAAS_APP_ID / BAAS_REST_KEY) — this file carries no secrets.
 * Run it on any one app node.
 *
 * Columns (all string / VARCHAR(500)):
 *   User          Users.objectId the token acts as
 *   Name          human label ("ci", "laptop")
 *   TokenPrefix   first 14 chars of the token, for the list UI ("roxp_1a2b3c…")
 *   TokenHash     sha-256 hex of the full token — the only stored form
 *   Scopes        csv subset of: deploy, logs, read
 *   LastUsedAt    ISO ts, touched by patIdentify()
 *   ExpiresAt     ISO ts, or "" for no expiry
 *   Revoked       "0" | "1"
 */

$host = getenv('BAAS_HOST');
if (!$host) {
    $host = trim((string) shell_exec("hostname -I 2>/dev/null | awk '{print \$1}'")) ?: '127.0.0.1';
}
$BASE = "http://{$host}:9000/1";
fwrite(STDERR, "using BaaS at {$BASE}\n");

// The console's App-ID + REST (master) key. On a node they are in
// libs/server_setup.php — read them from there so this script carries no
// secrets, or override with BAAS_APP_ID / BAAS_REST_KEY.
$appId  = getenv('BAAS_APP_ID') ?: null;
$restKey = getenv('BAAS_REST_KEY') ?: null;
$setup = '/var/www/console/libs/server_setup.php';
if ((!$appId || !$restKey) && is_readable($setup)) {
    $src = (string) file_get_contents($setup);
    if (!$restKey && preg_match("/'X-BEA-Authorization'\s*=>\s*'([^']+)'/", $src, $m)) $restKey = $m[1];
    if (!$appId && preg_match("/'X-BEA-Application-Id'\s*=>\s*'([^']+)'/i", $src, $m)) $appId = $m[1];
}
if (!$appId || !$restKey) {
    fwrite(STDERR, "set BAAS_APP_ID and BAAS_REST_KEY (or run where {$setup} is readable)\n");
    exit(1);
}

$HEADERS = [
    'Content-Type: application/json',
    "X-BEA-Authorization: {$restKey}",
    "X-BEA-Application-Id: {$appId}",
];

function call(string $method, string $url, ?array $body, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
    ] + ($body !== null ? [CURLOPT_POSTFIELDS => json_encode($body)] : []));
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($res === false) {
        fwrite(STDERR, "request failed: {$err}\n");
        exit(1);
    }
    return [$code, (string) $res];
}

// 1. Create the class (classType 1 = a plain data class). A duplicate is fine.
[$c, $r] = call('POST', "{$BASE}/schemas", [
    'className' => 'PersonalAccessTokens',
    'classType' => 1,
    'options'   => new stdClass(),
], $HEADERS);
echo "create class: HTTP {$c}\n{$r}\n\n";

// 2. Add the columns. `fields` is DOUBLE-wrapped — createFields iterates the
//    outer list expecting each element to be a list of field objects.
[$c, $r] = call('PUT', "{$BASE}/Schemas/PersonalAccessTokens", [
    'className' => 'PersonalAccessTokens',
    'fields'    => [[
        ['name' => 'User',        'type' => 'string'],
        ['name' => 'Name',        'type' => 'string'],
        ['name' => 'TokenPrefix', 'type' => 'string'],
        ['name' => 'TokenHash',   'type' => 'string'],
        ['name' => 'Scopes',      'type' => 'string'],
        ['name' => 'LastUsedAt',  'type' => 'string'],
        ['name' => 'ExpiresAt',   'type' => 'string'],
        ['name' => 'Revoked',     'type' => 'string'],
    ]],
], $HEADERS);
echo "add fields: HTTP {$c}\n{$r}\n\n";

// 3. Read it back.
[$c, $check] = call('GET', "{$BASE}/Schemas/PersonalAccessTokens", null, $HEADERS);
$want = ['User', 'Name', 'TokenPrefix', 'TokenHash', 'Scopes', 'LastUsedAt', 'ExpiresAt', 'Revoked'];
$missing = array_values(array_filter($want, fn ($f) => !str_contains($check, "\"{$f}\"")));
if ($missing) {
    fwrite(STDERR, "still missing: " . implode(', ', $missing) . "\n{$check}\n");
    exit(1);
}
echo "all 8 columns present on PersonalAccessTokens\n";
