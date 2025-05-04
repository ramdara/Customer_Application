// src/components/NavBar.js
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FaHome, FaPlus, FaSlidersH, FaSignOutAlt, FaArrowLeft, FaBars } from 'react-icons/fa';
import { motion } from 'framer-motion';
import 'bootstrap/dist/css/bootstrap.min.css';

const NavBar = ({ signOut }) => {
  const [collapsed, setCollapsed] = useState(false);
  const toggleMenu = () => setCollapsed(!collapsed);

  return (
    <motion.div className={`d-flex flex-column bg-light text-white vh-100 p-3 ${collapsed ? 'collapsed' : ''}`}
      initial={{ width: collapsed ? 80 : 200 }}
      animate={{ width: collapsed ? 80 : 200 }}
      transition={{ duration: 0.3 }}
    >
      <div className="d-flex justify-content-between align-items-center">
        <button className="btn btn-outline-primary mb-3" onClick={toggleMenu}>
          {collapsed ? <FaBars /> : <FaArrowLeft />}
        </button>
      </div>

      <nav className="nav flex-column">
        <NavLink to="/" end className={({ isActive }) => `nav-link  ${isActive ? 'active ' : ''}`}>
          {collapsed && <FaHome className="me-2" />}
          {!collapsed && <span>Home</span>}
        </NavLink>

        <NavLink to="/input" className={({ isActive }) => `nav-link  ${isActive ? 'active ' : ''}`}>
          {collapsed && <FaPlus className="me-2" />}
          {!collapsed && <span>Add Usage Data</span>}
        </NavLink>

        <NavLink to="/set-threshold" className={({ isActive }) => `nav-link  ${isActive ? 'active ' : ''}`}>
          {collapsed && <FaSlidersH className="me-2" />}
          {!collapsed && <span>Set Threshold</span>}
        </NavLink>
      </nav>

      <div className="mt-auto">
        <button onClick={signOut} className="btn btn-danger w-100">
          <FaSignOutAlt className="me-2" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </motion.div>
  );
};

export default NavBar;
