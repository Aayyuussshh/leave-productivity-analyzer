import db from "../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { month } = req.query; // format: YYYY-MM

  if (!month) {
    return res.status(400).json({ error: "Month is required (YYYY-MM)" });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        e.employee_code AS employee_code,
        DATE_FORMAT(MIN(a.date), '%Y-%m') AS month,
        SUM(a.expected_hours) AS expected_hours,
        SUM(a.worked_hours) AS actual_hours,
        SUM(a.is_leave) AS leaves_used,
        ROUND(
          (SUM(a.worked_hours) / NULLIF(SUM(a.expected_hours), 0)) * 100,
          2
        ) AS productivity
      FROM attendance a
      INNER JOIN employees e ON a.employee_id = e.id
      WHERE DATE_FORMAT(a.date, '%Y-%m') = ?
      GROUP BY e.employee_code
      ORDER BY e.employee_code
      `,
      [month]
    );

    return res.json({
      success: true,
      month,
      totalEmployees: rows.length,
      data: rows,
    });

  } catch (error) {
    console.error("Monthly summary error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}