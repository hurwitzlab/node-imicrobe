/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_to_project_group', {
    project_to_project_group_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    project_group_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'project_group',
        key: 'project_group_id'
      }
    },
    project_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'project',
        key: 'project_id'
      }
    }
  }, {
    tableName: 'project_to_project_group'
  });
};
