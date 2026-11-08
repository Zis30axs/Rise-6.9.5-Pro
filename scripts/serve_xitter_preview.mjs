import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../outputs/xitter-qa/index.html',import.meta.url));
createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html);}).listen(5198,'127.0.0.1');
