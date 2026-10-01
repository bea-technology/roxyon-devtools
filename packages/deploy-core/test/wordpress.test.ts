import { describe, expect, it } from 'vitest';
import { buildWpConfig } from '../src/wordpress.js';

const SAMPLE = `<?php
define( 'DB_NAME', 'database_name_here' );
define( 'DB_USER', 'username_here' );
define( 'DB_PASSWORD', 'password_here' );
define( 'DB_HOST', 'localhost' );

define( 'AUTH_KEY',         'put your unique phrase here' );
define( 'SECURE_AUTH_KEY',  'put your unique phrase here' );
define( 'LOGGED_IN_KEY',    'put your unique phrase here' );
define( 'NONCE_KEY',        'put your unique phrase here' );
define( 'AUTH_SALT',        'put your unique phrase here' );
define( 'SECURE_AUTH_SALT', 'put your unique phrase here' );
define( 'LOGGED_IN_SALT',   'put your unique phrase here' );
define( 'NONCE_SALT',       'put your unique phrase here' );

$table_prefix = 'wp_';
`;

const DB = { name: 'acme_wp', username: 'acme_wp', password: "p'a\\ss", host: '10.0.0.2:6033' };

describe('buildWpConfig', () => {
  it('fills in the database credentials and host', () => {
    const out = buildWpConfig(SAMPLE, DB);
    expect(out).toContain("define( 'DB_NAME', 'acme_wp' );");
    expect(out).toContain("define( 'DB_USER', 'acme_wp' );");
    expect(out).toContain("define( 'DB_HOST', '10.0.0.2:6033' );");
    // the password contains a single quote and a backslash — both escaped for PHP
    expect(out).toContain("define( 'DB_PASSWORD', 'p\\'a\\\\ss' );");
  });

  it('uses a custom table prefix when given', () => {
    const out = buildWpConfig(SAMPLE, DB, 'roxyon_');
    expect(out).toContain("$table_prefix = 'roxyon_';");
  });

  it('defaults the table prefix to wp_', () => {
    const out = buildWpConfig(SAMPLE, DB);
    expect(out).toContain("$table_prefix = 'wp_';");
  });

  it('splices fetched salts in place of the placeholder block', () => {
    const salts = "define('AUTH_KEY', 'abc123');\ndefine('NONCE_SALT', 'xyz789');";
    const out = buildWpConfig(SAMPLE, DB, 'wp_', salts);
    expect(out).not.toContain('put your unique phrase here');
    expect(out).toContain("define('AUTH_KEY', 'abc123');");
    expect(out).toContain("define('NONCE_SALT', 'xyz789');");
  });

  it('leaves the placeholder block alone when no salts were fetched', () => {
    const out = buildWpConfig(SAMPLE, DB, 'wp_', '');
    expect(out).toContain('put your unique phrase here');
  });
});
