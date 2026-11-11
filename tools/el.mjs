import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('/Users/andres/Desktop/Coding/Icarus/.env.local','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]));
export const key = env.ELEVENLABS_API_KEY;
export const el = (path, opt={}) => fetch('https://api.elevenlabs.io'+path, { ...opt, headers: { 'xi-api-key': key, ...(opt.headers||{}) } });
