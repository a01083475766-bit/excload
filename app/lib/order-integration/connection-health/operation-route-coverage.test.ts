import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const MALLS = [
  'smartstore',
  'coupang',
  'eleven',
  'cafe24',
  'lotteon',
  'ssg',
  'cjonstyle',
  'shopby',
  'godomall',
  'makeshop',
] as const;

function routeSource(mall: (typeof MALLS)[number], route: 'test' | 'fetch-orders'): string {
  return readFileSync(
    join(process.cwd(), 'app', 'api', 'order', 'integration', mall, route, 'route.ts'),
    'utf8',
  );
}

function callsNamed(source: string, predicate: (name: string) => boolean): ts.CallExpression[] {
  const file = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && predicate(node.expression.text)) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return calls;
}

function objectPropertyNames(node: ts.Expression | undefined): string[] {
  if (!node || !ts.isObjectLiteralExpression(node)) return [];
  return node.properties.flatMap((property) => {
    if (!('name' in property) || !property.name) return [];
    return [property.name.getText().replace(/^['"]|['"]$/g, '')];
  });
}

describe('직접 연동 라우트 operation sequence 적용 범위', () => {
  it.each(MALLS)('%s 연결 테스트가 account 확인 뒤 sequence를 발급하고 모든 결과에 전달한다', (mall) => {
    const source = routeSource(mall, 'test');
    const beginCalls = callsNamed(source, (name) => name === 'beginConnectionHealthOperation');
    const markCalls = callsNamed(source, (name) => /^mark.+AccountTestResult$/.test(name));

    expect(beginCalls).toHaveLength(1);
    expect(source.indexOf('if (!account)')).toBeLessThan(beginCalls[0]!.getStart());
    expect(beginCalls[0]!.arguments[0]?.getText()).toContain("source: 'connection_test'");
    expect(markCalls.length).toBeGreaterThan(0);
    for (const call of markCalls) {
      expect(objectPropertyNames(call.arguments[0])).toEqual(
        expect.arrayContaining(['accountId', 'userId', 'operationSequence', 'result']),
      );
    }
  });

  it.each(MALLS)('%s 주문조회가 account 확인 뒤 sequence를 발급하고 모든 결과에 전달한다', (mall) => {
    const source = routeSource(mall, 'fetch-orders');
    const beginCalls = callsNamed(source, (name) => name === 'beginConnectionHealthOperation');
    const markCalls = callsNamed(source, (name) => /^mark.+AccountSyncResult$/.test(name));

    expect(beginCalls).toHaveLength(1);
    expect(source.indexOf('if (!account)')).toBeLessThan(beginCalls[0]!.getStart());
    expect(beginCalls[0]!.arguments[0]?.getText()).toContain("source: 'fetch_orders'");
    expect(markCalls.length).toBeGreaterThan(0);
    for (const call of markCalls) {
      expect(objectPropertyNames(call.arguments[0])).toEqual(
        expect.arrayContaining(['accountId', 'userId', 'operationSequence', 'result']),
      );
    }
  });
});
