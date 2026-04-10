const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT',
  'OFFSET', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS',
  'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'BETWEEN', 'LIKE',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'UNION', 'ALL', 'DISTINCT',
  'CREATE', 'TEMP', 'VIEW', 'TABLE', 'INSERT', 'UPDATE', 'DELETE', 'DROP',
  'ASC', 'DESC', 'FILTER', 'OVER', 'PARTITION', 'WINDOW', 'ROWS', 'RANGE',
  'REPLACE', 'INTO', 'VALUES', 'SET', 'EXISTS', 'TRUE', 'FALSE',
]);

const FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'CAST', 'COALESCE',
  'DATE_TRUNC', 'STRFTIME', 'EXTRACT', 'YEAR', 'MONTH', 'DAY',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'NTILE',
  'FIRST_VALUE', 'LAST_VALUE', 'PERCENT_RANK', 'CUME_DIST',
  'STRING_AGG', 'LIST_AGG', 'ARRAY_AGG', 'UNNEST', 'GENERATE_SERIES',
  'UPPER', 'LOWER', 'LENGTH', 'TRIM', 'SUBSTR', 'REPLACE', 'CONCAT',
  'ABS', 'CEIL', 'FLOOR', 'POWER', 'SQRT', 'LOG', 'LN',
  'IFNULL', 'NULLIF', 'TRY_CAST', 'TYPEOF', 'EPOCH_MS',
]);

interface Token {
  type: 'keyword' | 'function' | 'string' | 'number' | 'operator' | 'comment' | 'identifier' | 'whitespace';
  value: string;
}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    // Whitespace
    if (/\s/.test(sql[i])) {
      let j = i;
      while (j < sql.length && /\s/.test(sql[j])) j++;
      tokens.push({ type: 'whitespace', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    // Single-line comment
    if (sql[i] === '-' && sql[i + 1] === '-') {
      let j = i;
      while (j < sql.length && sql[j] !== '\n') j++;
      tokens.push({ type: 'comment', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    // String literal (single quotes)
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && sql[j] !== "'") {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2; // escaped quote
        else j++;
      }
      tokens.push({ type: 'string', value: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Double-quoted identifier
    if (sql[i] === '"') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== '"') j++;
      tokens.push({ type: 'identifier', value: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Number
    if (/\d/.test(sql[i]) || (sql[i] === '.' && /\d/.test(sql[i + 1] || ''))) {
      let j = i;
      while (j < sql.length && /[\d.eE+-]/.test(sql[j])) j++;
      tokens.push({ type: 'number', value: sql.slice(i, j) });
      i = j;
      continue;
    }

    // Word (keyword, function, or identifier)
    if (/[a-zA-Z_]/.test(sql[i])) {
      let j = i;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      const word = sql.slice(i, j);
      const upper = word.toUpperCase();

      // Check if next non-space char is '(' → function
      let k = j;
      while (k < sql.length && sql[k] === ' ') k++;

      if (FUNCTIONS.has(upper) && sql[k] === '(') {
        tokens.push({ type: 'function', value: word });
      } else if (KEYWORDS.has(upper)) {
        tokens.push({ type: 'keyword', value: word });
      } else {
        tokens.push({ type: 'identifier', value: word });
      }
      i = j;
      continue;
    }

    // Operators and punctuation
    tokens.push({ type: 'operator', value: sql[i] });
    i++;
  }

  return tokens;
}

export function SqlHighlight({ sql, className = '' }: { sql: string; className?: string }) {
  const tokens = tokenize(sql);

  return (
    <code className={`font-mono ${className}`}>
      {tokens.map((token, i) => {
        if (token.type === 'whitespace') return <span key={i}>{token.value}</span>;
        return (
          <span key={i} className={`sql-${token.type}`}>
            {token.value}
          </span>
        );
      })}
    </code>
  );
}
