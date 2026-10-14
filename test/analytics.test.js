// Statistiques de visite : uniquement sur la démo publiée, jamais dans la bibliothèque.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const demo = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');

test('la démo contient le script Umami, limité à jsgantt.charlescoiffier.fr, avec Do Not Track', () => {
  const tag = demo.match(/<script[^>]*src="https:\/\/stats\.charlescoiffier\.fr\/script\.js"[^>]*>/);
  assert.ok(tag, 'balise Umami introuvable dans demo/index.html');
  assert.match(tag[0], /\bdefer\b/);
  assert.match(tag[0], /data-website-id="df9b36a6-a121-46e0-8b4b-881f370e58f9"/);
  assert.match(tag[0], /data-domains="jsgantt\.charlescoiffier\.fr"/);
  assert.match(tag[0], /data-do-not-track="true"/);
});

test('la bibliothèque (src/) ne contient aucun traceur ni appel à stats.charlescoiffier.fr', () => {
  const root = new URL('../src/', import.meta.url).pathname;
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((f) => { const p = join(dir, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
  walk(root);
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /stats\.charlescoiffier\.fr/, file);
  }
});
