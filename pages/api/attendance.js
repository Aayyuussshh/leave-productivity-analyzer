import db from "../../lib/db";

// Helper: get day name from date
function getDayName(dateStr) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(dateStr).getDay()];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { employeeId, month } = req.query;

  if (!employeeId || !month) {
    return res.status(400).json({ error: "employeeId and month are required" });
  }

  try {
    // ✅ CRITICAL FIX: Add WHERE clause to filter by month
    const [rows] = await db.query(
      `
      SELECT 
        date,
        in_time,
        out_time,
        worked_hours,
        expected_hours,
        is_leave
      FROM attendance
      WHERE employee_id = ?
      AND DATE_FORMAT(date, '%Y-%m') = ?
    ORDER BY date
      `,
      [employeeId, month]
    );

    const formatted = rows.map(r => {
      const day = getDayName(r.date);
      let status = "Present";

      if (day === "Sunday") status = "Off";
      else if (r.is_leave) status = "Leave";

      return {
        date: r.date,
        day,
        inTime: r.in_time,
        outTime: r.out_time,
        workedHours: r.worked_hours,
        expectedHours: r.expected_hours,
        status
      };
    });

    return res.json({
      success: true,
      employeeId: Number(employeeId),
      month,
      totalDays: formatted.length,
      data: formatted
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
}