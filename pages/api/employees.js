import db from "../../lib/db";

export default async function handler(req, res) {
  // ✅ Railway DB guard
  if (!db) {
    return res.status(500).json({
      error: "Database not available (Railway environment)",
    });
  }

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

    const data = rows || [];

    return res.status(200).json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error) {
    console.error("Employee API error:", error);
    return res.status(500).json({
      error: "Failed to fetch employees",
      details: error.message,
    });
  }
}
