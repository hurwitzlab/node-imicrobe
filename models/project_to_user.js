/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_to_user', {
    project_to_user_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      defaultValue: '0',
      references: {
        model: 'project',
        key: 'project_id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      defaultValue: '0',
      references: {
        model: 'user',
        key: 'user_id'
      }
    },
    permission: {
      type: DataTypes.INTEGER(4),
      allowNull: true,
      get() { //FIXME in common with project_group_to_user.js
        const permission = this.getDataValue('permission');
        if (permission == 1) return "owner";
        if (permission == 2) return "read-write";
        if (permission == 3) return "read-only";
        return "none";
      }
    }
  }, {
    tableName: 'project_to_user'
  });
};
