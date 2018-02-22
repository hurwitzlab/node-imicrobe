/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sample_to_user', {
    sample_to_user_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    sample_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      defaultValue: '0',
      references: {
        model: 'sample',
        key: 'sample_id'
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
      allowNull: true
    }
  }, {
    tableName: 'sample_to_user'
  });
};
