require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { execSync } = require('child_process');

const app = express();

// Vérification des variables d'environnement requises
const requiredEnvVars = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_CALLBACK_URL',
  'SESSION_SECRET'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Erreur: La variable d'environnement ${envVar} est manquante`);
    process.exit(1);
  }
}

// Configuration de la base de données JSON
const dbPath = path.join(__dirname, 'database.json');
let db = {
  users: [],
  verified: [],
  blacklist: []
};

// Variables pour le contrôle des sauvegardes
let lastSave = 0;
const SAVE_INTERVAL = 60000; // 1 minute entre les sauvegardes
let isSaving = false;

// Charger la base de données
async function loadDatabase() {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    db = JSON.parse(data);
    console.log('[DB] Database loaded successfully');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[DB] No existing database, creating new one');
      await saveDatabase();
    } else {
      console.error('[DB] Error loading database:', err);
    }
  }
}

// Sauvegarder la base de données
async function saveDatabase(force = false) {
  const now = Date.now();
  
  if (!force && (isSaving || (now - lastSave < SAVE_INTERVAL))) {
    return;
  }

  isSaving = true;
  
  try {
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    console.log('[DB] Saved locally');
    lastSave = now;

    if (process.env.VERCEL) {
      try {
        console.log('[GIT] Starting sync with GitHub...');
        execSync('git config --global user.name "DSVerify Bot"');
        execSync('git config --global user.email "bot@dsverify.com"');
        execSync('git pull origin main', { stdio: 'inherit' });
        execSync('git add database.json', { stdio: 'inherit' });
        execSync(`git commit -m "Auto-update database [${new Date().toISOString()}]"`, { 
          stdio: 'inherit' 
        });
        execSync('git push origin main', { stdio: 'inherit' });
        console.log('[GIT] Successfully synced with GitHub');
      } catch (gitError) {
        console.error('[GIT] Error during sync:', gitError.message);
      }
    }
  } catch (err) {
    console.error('[DB] Save error:', err);
  } finally {
    isSaving = false;
  }
}

// Configuration des vues EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration des sessions (sans MongoDB)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7200000, // 2 heures
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Cache-control pour les pages admin
app.use((req, res, next) => {
    if (req.path.includes('/admin')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

// Initialisation de Passport
app.use(passport.initialize());
app.use(passport.session());

// Configuration de la stratégie Discord
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'email', 'guilds', 'guilds.join']
}, (accessToken, refreshToken, profile, done) => {
    profile.discordToken = accessToken;
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Middleware d'authentification admin
const requireAuth = (req, res, next) => {
    if (req.session?.authenticated && (Date.now() - req.session.loginTime) < 7200000) {
        return next();
    }
    req.session.destroy();
    res.redirect('/adminlogin');
};

// Fonction pour récupérer l'IP publique
async function getPublicIp() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        return response.data.ip;
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'IP:', error);
        return 'N/A';
    }
}

// Charger la DB au démarrage
loadDatabase().then(() => {
    console.log('[APP] Database initialized');
});

// Routes principales
app.get('/', (req, res) => {
    res.render('verify', {
        logoPath: '/text.png',
        backgroundPath: '/background.png'
    });
});

// Authentification Discord
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }),
    async (req, res) => {
        try {
            const ip = await getPublicIp();
            const userData = {
                date: new Date().toISOString(),
                username: req.user.username,
                discriminator: req.user.discriminator,
                email: req.user.email || 'N/A',
                ip: ip,
                id: req.user.id,
            };

            const existingUser = db.users.find(u => u.id === req.user.id);
            if (!existingUser) {
                db.users.push(userData);
            }

            const isVerified = db.verified.find(u => u.id === req.user.id);
            if (!isVerified) {
                db.verified.push({ 
                    id: req.user.id, 
                    username: `${req.user.username}#${req.user.discriminator}` 
                });
            }

            await saveDatabase();
            res.redirect('/verified');
        } catch (error) {
            console.error('[VERIFICATION ERROR]', error);
            res.redirect('/?error=verification_failed');
        }
    }
);

// Page de vérification réussie
app.get('/verified', (req, res) => {
    if (!req.user) return res.redirect('/');
    res.render('verified', {
        user: req.user,
        logoPath: '/text.png',
        backgroundPath: '/background.png'
    });
});

// Admin Login
app.get('/adminlogin', (req, res) => {
    res.render('adminlogin', {
        logoPath: '/text.png',
        backgroundPath: '/background.png',
        error: req.query.error
    });
});

app.post('/adminlogin', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        req.session.authenticated = true;
        req.session.loginTime = Date.now();
        return res.redirect('/admin');
    }
    res.redirect('/adminlogin?error=1');
});

// Admin Dashboard
app.get('/admin', requireAuth, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const stats = {
            total: db.users.length,
            today: db.users.filter(u => new Date(u.date) >= today).length,
            uniqueIPs: [...new Set(db.users.map(u => u.ip))].length,
            verifiedCount: db.verified.length
        };

        res.render('admin', { 
            users: [...db.users].reverse(),
            verifiedUsers: db.verified,
            blacklist: db.blacklist,
            stats,
            logoPath: '/text.png',
            backgroundPath: '/background.png',
            currentPath: req.path
        });
    } catch (error) {
        console.error('[ADMIN ERROR]', error);
        res.status(500).render('error', { 
            message: 'Erreur de chargement des données admin',
            logoPath: '/text.png'
        });
    }
});

// Transfer
app.get('/admin/transfer', requireAuth, (req, res) => {
    res.render('transfer', {
        logoPath: '/text.png',
        backgroundPath: '/background.png',
        currentPath: '/admin/transfer',
        verifiedUsers: db.verified
    });
});

// API pour la blacklist
app.post('/api/blacklist', requireAuth, async (req, res) => {
    try {
        const { userId, username, ip } = req.body;
        
        if (!db.blacklist.some(u => u.id === userId)) {
            db.blacklist.push({
                id: userId,
                username,
                ip,
                date: new Date().toISOString()
            });
            
            db.verified = db.verified.filter(u => u.id !== userId);
            
            await saveDatabase(true);
            return res.status(200).json({ success: true });
        }
        
        res.status(200).json({ success: false, message: 'User already blacklisted' });
    } catch (error) {
        console.error('[BLACKLIST ERROR]', error);
        res.status(500).json({ error: 'Failed to blacklist user' });
    }
});

app.delete('/api/blacklist/:userId', requireAuth, async (req, res) => {
    try {
        const initialLength = db.blacklist.length;
        db.blacklist = db.blacklist.filter(u => u.id !== req.params.userId);
        
        if (db.blacklist.length < initialLength) {
            await saveDatabase(true);
            return res.status(200).json({ success: true });
        }
        
        res.status(200).json({ success: false, message: 'User not found in blacklist' });
    } catch (error) {
        console.error('[BLACKLIST REMOVE ERROR]', error);
        res.status(500).json({ error: 'Failed to remove from blacklist' });
    }
});

// API pour les utilisateurs vérifiés
app.get('/api/verified-users', (req, res) => {
    res.json(db.verified);
});

app.delete('/api/verified-users/:userId', requireAuth, async (req, res) => {
    try {
        const initialLength = db.verified.length;
        db.verified = db.verified.filter(u => u.id !== req.params.userId);
        
        if (db.verified.length < initialLength) {
            await saveDatabase(true);
            return res.status(200).json({ success: true });
        }
        
        res.status(200).json({ success: false, message: 'User not found in verified list' });
    } catch (error) {
        console.error('[VERIFIED REMOVE ERROR]', error);
        res.status(500).json({ error: 'Failed to remove authorization' });
    }
});

// API Secrètes
app.get(process.env.API_BLACKLIST_PATH || '/api/secure-blacklist', (req, res) => {
    res.json(db.blacklist);
});

app.get(process.env.API_VERIFIED_PATH || '/api/secure-verified', (req, res) => {
    res.json({ 
        users: db.users,
        verified: db.verified 
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/adminlogin');
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error('[GLOBAL ERROR]', err);
    res.status(500).render('error', { 
        message: 'Une erreur est survenue',
        logoPath: '/text.png'
    });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`Routes API secrètes:
    - Blacklist: ${process.env.API_BLACKLIST_PATH || '/api/secure-blacklist'}
    - Verified: ${process.env.API_VERIFIED_PATH || '/api/secure-verified'}`);
});

process.on('SIGINT', async () => {
    console.log('Saving database before shutdown...');
    await saveDatabase(true);
    process.exit();
});
