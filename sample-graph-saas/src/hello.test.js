import { hello } from './hello.js';
if(hello()!=='ok') throw new Error('fail');
console.log('PASS hello');
