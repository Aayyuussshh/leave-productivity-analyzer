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

  const { employeeId, month } = req.query;

  // ✅ Required query validation
  if (!employeeId || !month) {
    return res.status(400).json({
      error: "employeeId and month are required",
    });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        SUM(CASE WHEN is_leave = 0 THEN expected_hours ELSE 0 END) AS expectedHours,
        SUM(worked_hours) AS actualHours,
        SUM(is_leave) AS leavesUsed
            FROM attendance
              WHERE employee_id = ?
                AND DATE_FORMAT(date, '%Y-%m') = ?
      `,
      [employeeId, month]
    );

    // ✅ Defensive fallback
    const summary = rows?.[0] || {};

    const expectedHours = Number(summary.expectedHours || 0);
    const actualHours = Number(summary.actualHours || 0);
    const leavesUsed = Number(summary.leavesUsed || 0);

    const productivity =
      expectedHours > 0
        ? Number(((actualHours / expectedHours) * 100).toFixed(2))
        : 0;

    return res.status(200).json({
      success: true,
      employeeId: Number(employeeId),
      month,
      expectedHours: Number(expectedHours.toFixed(2)),
      actualHours: Number(actualHours.toFixed(2)),
      leavesUsed,
      productivity,
    });
  } catch (error) {
    console.error("Employee summary error:", error);
    return res.status(500).json({
      error: "Failed to fetch employee summary",
      details: error.message,
    });
  }
}
