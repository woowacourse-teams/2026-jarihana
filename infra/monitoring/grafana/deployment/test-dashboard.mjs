import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildDashboard, output, validateDashboard } from './build-dashboard.mjs';

test('generated file reproduces the native source and is deterministic', () => {
  const generated = JSON.parse(readFileSync(output, 'utf8'));
  assert.deepEqual(generated, buildDashboard());
  assert.deepEqual(buildDashboard(), buildDashboard());
});

test('each environment has its own conditional row, with PROD selected on open', () => {
  const { spec } = buildDashboard();
  assert.deepEqual(spec.layout.spec.rows.map(row => row.spec.conditionalRendering.spec.items[0].spec.value), ['prod', 'dev']);
  assert.equal(spec.variables[0].spec.current.value, 'prod');
});

test('DEV has one backend, no A/B route, and shares PROD card and stage geometry', () => {
  const { elements } = buildDashboard().spec;
  const dev = elements['panel-5'].spec.vizConfig.spec.options.root.elements;
  const prod = elements['panel-105'].spec.vizConfig.spec.options.root.elements;
  assert(dev.some(node => node.name === 'dev-app'));
  assert(!dev.some(node => ['nginx', 'slot-a', 'slot-b'].includes(node.name)));
  for (const name of ['artboard', 'user', 'cloudfront', 'frontend', 'database', 'deployment-lane']) {
    assert.deepEqual(dev.find(node => node.name === name).placement, prod.find(node => node.name === name).placement);
  }
  for (let step = 1; step <= 6; step++) {
    const node = dev.find(node => node.name === `dev-stage-${step}`);
    assert.deepEqual(node.placement, prod.find(node => node.name === `prod-stage-${step}`).placement);
    assert.equal(node.type, 'metric-value');
    assert.equal(node.config.text.field, `dev_phase_step_${step}`);
  }
  for (let panel = 1; panel <= 4; panel++) assert.deepEqual(elements[`panel-${panel}`].spec.vizConfig.spec.options, elements[`panel-${panel + 100}`].spec.vizConfig.spec.options);
});

test('CloudFront and Nginx connection anchors keep upper and lower routes separate', () => {
  const prod = buildDashboard().spec.elements['panel-105'].spec.vizConfig.spec.options.root.elements;
  const cdn = prod.find(node => node.name === 'cloudfront').connections;
  assert(cdn.find(edge => edge.targetName === 'frontend').source.y > 0);
  assert(cdn.find(edge => edge.targetName === 'nginx').source.y < 0);
  const routes = prod.find(node => node.name === 'nginx').connections;
  assert(routes.find(edge => edge.targetName === 'slot-a').source.y > 0);
  assert(routes.find(edge => edge.targetName === 'slot-b').source.y < 0);
});

test('invalid graph targets, data bindings and environment leaks fail before provisioning', () => {
  for (const mutate of [
    dashboard => { dashboard.spec.elements['panel-5'].spec.vizConfig.spec.options.root.elements.find(node => node.name === 'cloudfront').connections[0].targetName = 'missing'; },
    dashboard => { dashboard.spec.elements['panel-5'].spec.vizConfig.spec.options.root.elements.find(node => node.name === 'current-dev-phase').config.text.field = 'missing'; },
    dashboard => { dashboard.spec.elements['panel-1'].spec.data.spec.queries[0].spec.query.spec.expr = 'vector(6)'; },
  ]) {
    const dashboard = buildDashboard();
    mutate(dashboard);
    assert.throws(() => validateDashboard(dashboard));
  }
});
