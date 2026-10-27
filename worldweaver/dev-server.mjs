import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = process.cwd();
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const port = Number(process.env.PORT) || 4173;
createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if(!path.startsWith(root+sep)){ res.writeHead(403);res.end('Forbidden');return; }
    const data=await readFile(path);
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,()=>console.log('Worldweaver at http://localhost:'+port));
