import mysql from "mysql2/promise";

const pool = mysql.createPool(process.env.MYSQL_URL);

export default pool;

// optional helper (keep it if your code uses it)
export async function query(sql, values) {
  const [rows] = await pool.query(sql, values);
  return rows;
}
