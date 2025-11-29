module.exports = {
  apps: [{
    name: "api-malewa-fac",
    script: "./dist/server.js", // Fichier compilé depuis src/server.ts

    // Options de production
    instances: 1,
    exec_mode: "fork",

    // Environnement
    env_production: {
      NODE_ENV: "production",
      PORT: 4000,
      // Ajoutez ici vos autres variables d'environnement (ex: DATABASE_URL, JWT_SECRET, etc.)
    },

    // Gestion des logs
    log_date_format: "YYYY-MM-DD HH:mm Z",
    error_file: "logs/err.log",
    out_file: "logs/out.log",

    // Redémarrage automatique
    watch: false,
    max_memory_restart: '250M',
  }]
};
