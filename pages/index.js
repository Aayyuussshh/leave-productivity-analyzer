import { useEffect, useState } from "react";

export default function Dashboard() {
  const [month, setMonth] = useState("2024-03");
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  /* ---------------- API CALLS ---------------- */

  useEffect(() => {
    fetch("/api/employees")
      .then(res => res.json())
      .then(data => setEmployees(data.data || []));
  }, []);

  useEffect(() => {
    fetch(`/api/monthly-summary?month=${month}`)
      .then(res => res.json())
      .then(data => setSummary(data));
  }, [month]);

  // Helper function to get employee ID from code
  const getEmployeeIdFromCode = (code) => {
    const emp = employees.find(e => e.employeeCode === code);
    // Add console log to verify the lookup
    if (emp) {
      console.log(`Found employee ID ${emp.id} for code ${code}`);
    } else {
      console.error(`Employee code ${code} not found in employees list`);
    }
    return emp ? emp.id : null;
  };

  const openAttendance = async (employeeCode) => {
    setSelectedEmployee(employeeCode); // Keep the code for display

    // Get the numeric ID for the API call
    const employeeId = getEmployeeIdFromCode(employeeCode);

    if (!employeeId) {
      console.error(`Employee code ${employeeCode} not found`);
      return;
    }

    console.log(`Fetching attendance for employee ID: ${employeeId}, month: ${month}`);
    const res = await fetch(
      `/api/attendance?employeeId=${employeeId}&month=${month}`
    );
    const data = await res.json();
    setAttendance(data.data || []);
  };

  const uploadExcel = async () => {
    if (!file) return alert("Please select an Excel file");

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setLoading(false);

    if (data.success) {
      setSuccessMsg("Excel uploaded successfully");
      setTimeout(() => setSuccessMsg(""), 3000);

      fetch(`/api/monthly-summary?month=${month}`)
        .then(res => res.json())
        .then(data => setSummary(data));
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Leave & Productivity Dashboard
        </h1>

        <div className="flex gap-3 items-center">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded-lg px-3 py-2 text-gray-900"
          />

          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files[0])}
            className="hidden"
            id="excelUpload"
          />
          <label
            htmlFor="excelUpload"
            className="px-4 py-2 border rounded-lg cursor-pointer bg-white text-gray-800 hover:bg-gray-100"
          >
            Choose File
          </label>

          <button
            onClick={uploadExcel}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Uploading..." : "Upload Excel"}
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="mb-4 text-green-700 font-semibold">
          ✅ {successMsg}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Expected Hours"
          value={`${summary?.data?.reduce((a, b) => a + Number(b.expected_hours), 0) || 0} hrs`}
          color="text-indigo-600"
        />
        <MetricCard
          title="Actual Hours"
          // Format to 1 decimal place
          value={`${(summary?.data?.reduce((a, b) => a + Number(b.actual_hours), 0) || 0).toFixed(1)} hrs`}
          color="text-green-600"
        />
        <MetricCard
          title="Leaves Used"
          value={summary?.data?.reduce((a, b) => a + Number(b.leaves_used), 0) || 0}
          color="text-orange-600"
        />
        <MetricCard
          title="Avg Productivity"
          value={
            summary?.data?.length
              ? `${(
                  summary.data.reduce((a, b) => a + Number(b.productivity), 0) /
                  summary.data.length
                ).toFixed(2)}%`
              : "0%"
          }
          color="text-red-600"
        />
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="p-4 text-left text-gray-900 font-semibold">Employee</th>
              <th className="p-4 text-left text-gray-900 font-semibold">Expected</th>
              <th className="p-4 text-left text-gray-900 font-semibold">Actual</th>
              <th className="p-4 text-left text-gray-900 font-semibold">Leaves</th>
              <th className="p-4 text-left text-gray-900 font-semibold">Productivity</th>
            </tr>
          </thead>
          <tbody>
            {summary?.data?.map(row => (
              <tr
                key={row.employee_code} // Use employee_code as key
                onClick={() => openAttendance(row.employee_code)} // Pass employee_code to openAttendance
                className="border-t cursor-pointer hover:bg-gray-50"
              >
                <td className="p-4 font-medium text-gray-900">
                  {row.employee_code} {/* Directly display the employee_code */}
                </td>
                <td className="p-4 text-gray-800">{row.expected_hours}</td>
                <td className="p-4 text-gray-800">
                  {Number(row.actual_hours).toFixed(2)}
                </td>
                <td className="p-4 text-gray-800">{row.leaves_used}</td>
                <td
                  className={`p-4 font-bold ${
                    row.productivity >= 75
                      ? "text-green-600"
                      : row.productivity >= 50
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {Number(row.productivity).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Attendance Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                Day-wise Attendance — {selectedEmployee}
              </h2>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="text-gray-600 hover:text-gray-900 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-gray-900">Date</th>
                    <th className="px-6 py-3 text-left text-gray-900">Day</th>
                    <th className="px-6 py-3 text-left text-gray-900">In</th>
                    <th className="px-6 py-3 text-left text-gray-900">Out</th>
                    <th className="px-6 py-3 text-left text-gray-900">Worked</th>
                    <th className="px-6 py-3 text-left text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-900">
                        {row.date.split("T")[0]}
                      </td>
                      <td className="px-6 py-3 text-gray-800">{row.day}</td>
                      <td className="px-6 py-3 text-gray-800">{row.inTime || "—"}</td>
                      <td className="px-6 py-3 text-gray-800">{row.outTime || "—"}</td>
                      <td className="px-6 py-3 text-gray-800">
                        {row.workedHours != null ? Number(row.workedHours).toFixed(2) : "—"}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            row.status === "Present"
                              ? "bg-green-100 text-green-700"
                              : row.status === "Leave"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Metric Card Component (Named Function) - Fixes Fast Refresh Warning ---------------- */
function MetricCard({ title, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <p className="text-gray-600 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}