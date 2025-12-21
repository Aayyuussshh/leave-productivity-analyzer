import mysql from "mysql2/promise";

let pool;

if (process.env.MYSQL_URL) {
  pool = mysql.createPool(process.env.MYSQL_URL);
} else {
  console.warn("MYSQL_URL not found. DB disabled (Railway-only mode).");
}

export default pool;
