const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const bcrypt = require('bcryptjs');

// Default to local SQLite database in server directory
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false
});

// Admin Model
const Admin = sequelize.define('Admin', {
  username: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

// Student Model
const Student = sequelize.define('Student', {
  enrollmentId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  className: {
    type: DataTypes.STRING,
    allowNull: false
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: true // Optional if you want to support login without password, but now we'll require it
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

// Tablet Model
const Tablet = sequelize.define('Tablet', {
  serialNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'in_use', 'blocked'),
    defaultValue: 'offline'
  },
  lastSeen: {
    type: DataTypes.DATE,
    allowNull: true
  },
  currentStudentId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
});

// Tablet Session Model (Historical Login logs)
const TabletSession = sequelize.define('TabletSession', {
  tabletId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  studentName: {
    type: DataTypes.STRING
  },
  tabletName: {
    type: DataTypes.STRING
  },
  loginTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  logoutTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  durationSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
});

// Tablet Status Logs
const TabletStatusLog = sequelize.define('TabletStatusLog', {
  tabletId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tabletName: {
    type: DataTypes.STRING
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Sync database and seed initial admin/student records if empty
async function initDatabase() {
  await sequelize.sync();
  
  // Seed initial Admin
  const adminCount = await Admin.count();
  if (adminCount === 0) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await Admin.create({
      username: 'admin',
      passwordHash: passwordHash
    });
    console.log('Seeded default admin user: username=admin, password=admin123');
  }

  // Seed some dummy students for testing
  const studentCount = await Student.count();
  if (studentCount === 0) {
    const studentPassHash = await bcrypt.hash('123456', 10);
    await Student.bulkCreate([
      { enrollmentId: '2026001', name: 'Ana Silva', className: '1º Ano A', passwordHash: studentPassHash, active: true },
      { enrollmentId: '2026002', name: 'Bruno Souza', className: '1º Ano B', passwordHash: studentPassHash, active: true },
      { enrollmentId: '2026003', name: 'Carlos Santos', className: '2º Ano A', passwordHash: studentPassHash, active: true },
      { enrollmentId: '2026004', name: 'Diana Oliveira', className: '3º Ano C', passwordHash: studentPassHash, active: true }
    ]);
    console.log('Seeded default test student accounts with password 123456');
  }
}

module.exports = {
  sequelize,
  Admin,
  Student,
  Tablet,
  TabletSession,
  TabletStatusLog,
  initDatabase
};
