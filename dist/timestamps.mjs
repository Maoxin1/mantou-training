// Compare saved edit times, never upload time. Unknown or tied times need a choice.
export function timestamp(value){return typeof value==='string'&&value.trim()?Date.parse(value):NaN;}
export function compareTimestamps(a,b){const x=timestamp(a),y=timestamp(b);return Number.isFinite(x)&&Number.isFinite(y)?Math.sign(x-y):0;}
export function latestTimestamp(values){return values.filter(x=>Number.isFinite(timestamp(x))).sort((a,b)=>timestamp(a)-timestamp(b)).at(-1);}
