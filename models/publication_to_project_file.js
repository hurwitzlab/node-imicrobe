/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('publication_to_project_file', {
    publication_to_project_file_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    publication_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'publication',
        key: 'publication_id'
      }
    },
    project_file_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      references: {
        model: 'project_file',
        key: 'project_file_id'
      }
    }
  }, {
    tableName: 'publication_to_project_file'
  });
};
