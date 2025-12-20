import db from "../../lib/db";

// Helper: get expected hours by day
function getExpectedHours(day) {
  if (day >= 1 && day <= 5) return 8.5; // Mon–Fri
  if (day === 6) return 4;              // Saturday
  return 0;                             // Sunday
}

// Helper: get all dates of a month - CORRECTED VERSION (FIXES TIMEZONE BUG)
function getMonthDates(year, month) {
  const dates = [];
  // Use noon (12:00) to avoid UTC shift issues
  let currentDate = new Date(year, month - 1, 1, 12); // Start from the first day of the month at noon

  // Loop until we reach the next month
  while (currentDate.getMonth() === month - 1) {
    dates.push(new Date(currentDate)); // Create a copy of the date
    currentDate.setDate(currentDate.getDate() + 1); // Move to the next day
  }

  return dates;
}

export default async function handler(req, res) {
  const { employeeId, month } = req.query; // month = YYYY-MM

  if (!employeeId || !month) {
    return res.status(400).json({ error: "employeeId and month required" });
  }

  try {
    const [year, mon] = month.split("-").map(Number);
    const dates = getMonthDates(year, mon);

    let inserted = 0;

    for (const d of dates) {
      const day = d.getDay(); // 0 = Sun

      // Skip Sundays (they are "Off", not "Leave")
      if (day === 0) {
        continue;
      }

      const dateStr = d.toISOString().split("T")[0];
      const expectedHours = getExpectedHours(day);

      // Check if attendance exists
      const [existing] = await db.query(
        `SELECT id FROM attendance 
         WHERE employee_id = ? AND date = ?`,
        [employeeId, dateStr]
      );

      if (existing.length === 0) {
        // Insert leave (only for Monday-Saturday)
        await db.query(
          `
          INSERT INTO attendance
          (employee_id, date, in_time, out_time, worked_hours, expected_hours, is_leave)
          VALUES (?, ?, NULL, NULL, 0, ?, 1)
          `,
          [employeeId, dateStr, expectedHours]
        );

        inserted++;
      }
    }

    return res.json({
      success: true,
      message: "Missing attendance auto-generated",
      employeeId,
      month,
      insertedLeaves: inserted,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}