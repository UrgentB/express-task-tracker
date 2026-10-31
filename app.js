export default function appSrc(express, bodyParser, createReadStream, crypto, http, mongoose) {
  const app = express();

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(bodyParser.text());

  app.use((req, res, next) => {
    if (req.path !== '/' && !req.path.endsWith('/') && !req.path.startsWith('/sha1:')) {
      return res.redirect(301, req.path + '/' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''));
    }
    next();
  });

  app.all('/login/', (req, res) => {
    res.send('urgentb');
  });

  app.all('/code/', (req, res) => {
    const filePath = decodeURIComponent(new URL(import.meta.url).pathname);
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).send('');
    });
    stream.pipe(res);
  });

  app.all('/sha1/:input/', (req, res) => {
    const hash = crypto.createHash('sha1').update(req.params.input).digest('hex');
    res.send(hash);
  });

  app.get('/req/', (req, res) => {
    const addr = req.query.addr;
    if (!addr) return res.send('');
    http.get(addr, (response) => {
      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => res.send(data));
    }).on('error', () => res.send(''));
  });

  app.post('/req/', (req, res) => {
    const addr = req.body.addr || req.query.addr;
    if (!addr) return res.send('');
    http.get(addr, (response) => {
      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => res.send(data));
    }).on('error', () => res.send(''));
  });

  app.post('/insert/', async (req, res) => {
    const { login, password, URL } = req.body;
    if (!URL) return res.status(400).send('no URL');

    let conn;
    try {
        conn = mongoose.createConnection(URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        });

        conn.on('error', (e) => console.log('CONN ERR:', e.message));

        await new Promise((resolve, reject) => {
        conn.once('open', resolve);
        conn.once('error', reject);
        });

        console.log('connected');

        const User = conn.model('User', new mongoose.Schema({
        login: String,
        password: String,
        }), 'users');

        await User.create({ login, password });
        console.log('inserted');

        res.send(login || '');
    } catch (e) {
        console.log('MONGO ERR:', e.message);
        res.status(500).send(e.message);
    } finally {
        if (conn) {
        try { await conn.close(); } catch (_) {}
        }
    }
  });

  app.all(/.*/, (req, res) => {
    res.send('urgentb');
  });

  return app;
}