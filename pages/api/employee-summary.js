import db from "../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { employeeId, month } = req.query;

    const [rows] = await db.query(
      `
      SELECT
        SUM(expected_hours) AS expectedHours,
        SUM(worked_hours) AS actualHours,
        SUM(is_leave) AS leavesUsed
      FROM attendance
      WHERE employee_id = ?
        AND DATE_FORMAT(date, '%Y-%m') = ?
      `,
      [employeeId, month]
    );

    const expectedHours = Number(rows[0].expectedHours || 0);
    const actualHours = Number(rows[0].actualHours || 0);
    const leavesUsed = Number(rows[0].leavesUsed || 0);

    const productivity =
      expectedHours > 0
        ? Number(((actualHours / expectedHours) * 100).toFixed(2))
        : null;

    return res.json({
      success: true,
      employeeId: Number(employeeId),
      month,
      expectedHours: Number(expectedHours.toFixed(2)),
      actualHours: Number(actualHours.toFixed(2)),
      leavesUsed,
      productivity,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
}
