import { scoreEvaluationCases } from '../src/shared/evaluation.ts';

const result = scoreEvaluationCases();
process.stdout.write(`Demo assessment evaluation: ${result.passed}/${result.total} (${result.percent}%)\n`);
for (const item of result.results) {
  process.stdout.write(`${item.passed ? 'PASS' : 'FAIL'} ${item.id}: ${item.score}/${item.maximumScore}\n`);
}
if (result.percent < 70) process.exitCode = 1;
