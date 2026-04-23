import DashboardTasks from '@/components/DashboardTasks';
import ProjectsTable from '@/components/ProjectsTable';

export default async function HomePage() {
  return (
    <div className="container">
      <DashboardTasks />
      <ProjectsTable />
    </div>
  );
}
