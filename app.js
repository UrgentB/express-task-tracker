export default function appSrc(express, bodyParser, createReadStream, crypto, http) {
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
    const filePath = decodeURIComponent(import.meta.url.substring(7));
    createReadStream(filePath).pipe(res);
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

  app.all(/.*/, (req, res) => {
    res.send('urgentb');
  });

  return app;
}