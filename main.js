// @ts-check
import { mountApp } from './app.js';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
mountApp(root);
