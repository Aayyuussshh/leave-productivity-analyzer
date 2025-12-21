import db from "../../lib/db";

// Helper: get day name safely (handles timezone shifts correctly)
function getDayName(dateStr) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  // Ensure the date string is treated as a local date to get the correct day
  // Create a Date object using the date string (YYYY-MM-DD) which is interpreted as local time at midnight
  const dateObj = new Date(dateStr);
  // Use getDay() which returns the day of the week based on local time
  return days[dateObj.getDay()];
}

export default async function handler(req, res) {
  // ✅ Railway-only DB guard
  if (!db) {
    return res.status(500).json({
      error: "Database not available (Railway environment only)",
    });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { employeeId, month } = req.query;

  if (!employeeId || !month) {
    return res.status(400).json({
      error: "employeeId and month are required",
    });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT 
        DATE(date) AS date,
        in_time,
        out_time,
        worked_hours,
        expected_hours,
        is_leave
      FROM attendance
      WHERE employee_id = ?
        AND DATE_FORMAT(date, '%Y-%m') = ?
      ORDER BY date ASC
      `,
      [employeeId, month]
    );

    const formatted = (rows || []).map((r) => {
      const day = getDayName(r.date);
      let status = "Present";

      if (day === "Sunday") {
        status = "Off";
      } else if (r.is_leave === 1) {
        status = "Leave";
      }

      return {
        date: r.date,
        day, // This will now be the correct day name (e.g., "Monday", "Tuesday", etc.)
        inTime: r.in_time,
        outTime: r.out_time,
        workedHours: Number(r.worked_hours || 0),
        expectedHours: Number(r.expected_hours || 0),
        status,
      };
    });

    return res.status(200).json({
      success: true,
      employeeId: Number(employeeId),
      month,
      totalDays: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error("Attendance API error:", error);
    return res.status(500).json({
      error: "Failed to fetch attendance",
      details: error.message,
    });
  }
}