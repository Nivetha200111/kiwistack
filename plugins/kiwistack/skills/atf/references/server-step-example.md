# Example: a server-side step for a data broker script include

```js
(function (outputs, steps, params, stepResult, assertEqual) {
  var rows = new x_acme_kiwi.OnboardingProgress().forActiveCases({ limit: 10 });
  assertEqual({ name: 'returns an array', shouldbe: true, value: Array.isArray(rows) });
  var created = steps('<record insert step sys_id>').record_id;
  var mine = rows.filter(function (r) { return r.caseId === created; });
  assertEqual({ name: 'includes the new hire', shouldbe: 1, value: mine.length });
})(outputs, steps, params, stepResult, assertEqual);
```

The names here are illustrative. Use the step ids and the script include that the test actually creates.
