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
        AUTH_USERNAME: 'admin' 
      } 
    } 
  ] 
}