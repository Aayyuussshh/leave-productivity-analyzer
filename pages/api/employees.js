import db from "../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        employee_code AS employeeCode,
        name
      FROM employees
      ORDER BY id
    `);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });

  } catch (error) {
    console.error("Employee API error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}