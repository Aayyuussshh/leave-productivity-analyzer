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

  const { month } = req.query; // YYYY-MM

  if (!month) {
    return res.status(400).json({
      error: "Month is required (YYYY-MM)",
    });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        e.employee_code AS employeeCode,
        DATE_FORMAT(MIN(a.date), '%Y-%m') AS month,
        SUM(a.expected_hours) AS expectedHours,
        SUM(a.worked_hours) AS workedHours,
        SUM(a.is_leave) AS leavesUsed,
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

    const data = (rows || []).map((r) => ({
      employeeCode: r.employeeCode,
      month: r.month,
      expectedHours: Number(r.expectedHours || 0),
      workedHours: Number(r.workedHours || 0),
      leavesUsed: Number(r.leavesUsed || 0),
      productivity: Number(r.productivity || 0),
    }));

    return res.status(200).json({
      success: true,
      month,
      totalEmployees: data.length,
      data,
    });
  } catch (error) {
    console.error("Monthly summary error:", error);
    return res.status(500).json({
      error: "Failed to fetch monthly summary",
      details: error.message,
    });
  }
}
