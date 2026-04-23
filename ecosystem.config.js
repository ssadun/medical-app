module.exports = {
  apps: [
    {
      name: 'medical-app',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3234,
        AUTH_USERNAME: 'admin',
        AUTH_PASSWORD_SALT: 'd212bca4b3e4ddfea4f85207b2a1f7ebec04d1b590afd5061de715115b6de32b',
        AUTH_PASSWORD_HASH: '6723385abcbea9231f7e64da26fa210397cfb192e83fc10020abfd7674a108e0b606ac670f13343cc45b6b8e511afc1da4cfbbdf5937d9b16f5f43322b58c827'
      }
    }
  ]
};
