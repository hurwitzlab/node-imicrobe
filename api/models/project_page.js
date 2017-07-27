/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_page', {
    project_page_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'project',
        key: 'project_id'
      }
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    contents: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    display_order: {
      type: DataTypes.INTEGER(11),
      allowNull: true
    },
    format: {
      type: DataTypes.ENUM('html','markdown'),
      allowNull: true,
      defaultValue: 'html'
    }
  }, {
    tableName: 'project_page'
  });
};
