
import { Link } from "react-router-dom";
export default function DashboardPage() {
  return (
    <div className="space-y-6 p-6">
      {/* Welcome section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome to CampusHub!
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Manage your subjects and track your learning progress.
        </p>
      </div>

      {/* Dashboard cards grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* My Subjects card */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            My Subjects
          </h2>

          <p className="mt-2 text-3xl font-bold text-gray-900">
            4
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Subjects available
          </p>
        </div>

      {/* Daily Quiz card */}
      <Link to="/daily-quiz" className="block">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Daily Quiz
          </h2>

          <p className="mt-2 text-3xl font-bold text-gray-900">
            Practice
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Test your knowledge every day.
          </p>
        </div>
        </Link>
      </div>
    </div>
  );
}
