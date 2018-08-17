/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project', {
    project_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    project_code: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      unique: true
    },
    project_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    pi: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    institution: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    project_type: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    url: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    read_file: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: ''
    },
    meta_file: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: ''
    },
    assembly_file: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: ''
    },
    peptide_file: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: ''
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ''
    },
    read_pep_file: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: ''
    },
    nt_file: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: ''
    },
    private: {
      type: DataTypes.INTEGER(1),
      allowNull: false,
      defaultValue: '0'
    },
    ebi_status: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    ebi_submitter_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'user',
        key: 'user_id'
      }
    },
    ebi_submission_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ebi_accn: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    creation_date: {
      type: DataTypes.TIME,
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    tableName: 'project'
  });
};
