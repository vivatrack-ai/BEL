import { Routes, Route, Navigate } from 'react-router-dom';
import { Toasts } from './components/ui.jsx';

import ExhibitorLayout from './exhibitor/ExhibitorLayout.jsx';
import CoExhibitors from './exhibitor/CoExhibitors.jsx';
import CoExhibitorAdd from './exhibitor/CoExhibitorAdd.jsx';
import AllocateStall from './exhibitor/AllocateStall.jsx';
import SpaceRequirement from './exhibitor/SpaceRequirement.jsx';
import Badges from './exhibitor/Badges.jsx';
import CatCoexPage from './exhibitor/CatCoexPage.jsx';
import Invitee from './exhibitor/Invitee.jsx';
import Vehicle from './exhibitor/Vehicle.jsx';
import AircraftList from './exhibitor/aircraft/AircraftList.jsx';
import AircraftForm1 from './exhibitor/aircraft/AircraftForm1.jsx';
import Air7A from './exhibitor/aircraft/Air7A.jsx';
import Air4 from './exhibitor/aircraft/Air4.jsx';
import Air7B from './exhibitor/aircraft/Air7B.jsx';

import AdminLayout from './admin/AdminLayout.jsx';
import AdminDashboard from './admin/AdminDashboard.jsx';
import AdminSpaceRequirements from './admin/AdminSpaceRequirements.jsx';
import AdminExhibitorDetail from './admin/AdminExhibitorDetail.jsx';
import AircraftApprovals from './admin/AircraftApprovals.jsx';
import ApplicationDetail from './admin/ApplicationDetail.jsx';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/exhibitor" element={<ExhibitorLayout />}>
          <Route index element={<Navigate to="co-exhibitors" replace />} />
          <Route path="co-exhibitors" element={<CoExhibitors />} />
          <Route path="co-exhibitors/add" element={<CoExhibitorAdd />} />
          <Route path="allocate-stall" element={<AllocateStall />} />
          <Route path="space-requirement" element={<SpaceRequirement />} />
          <Route path="passes/badges" element={<Badges />} />
          <Route path="passes/:section/coex/:catId" element={<CatCoexPage />} />
          <Route path="passes/invitee" element={<Invitee />} />
          <Route path="passes/vehicle" element={<Vehicle />} />
          <Route path="aircraft" element={<AircraftList />} />
          <Route path="aircraft/add" element={<AircraftForm1 />} />
          <Route path="aircraft/air7a" element={<Air7A />} />
          <Route path="aircraft/air4" element={<Air4 />} />
          <Route path="aircraft/air7b" element={<Air7B />} />
        </Route>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="space-requirements" element={<AdminSpaceRequirements />} />
          <Route path="exhibitor/:exId" element={<AdminExhibitorDetail />} />
          <Route path="aircraft-approvals" element={<AircraftApprovals />} />
          <Route path="aircraft-application/:id" element={<ApplicationDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/exhibitor/co-exhibitors" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
