// Copyright 2024 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from "react";
import {TreeSelect} from "antd";
import {HolderOutlined, UsergroupAddOutlined} from "@ant-design/icons";
import i18next from "i18next";
import * as GroupBackend from "../../backend/GroupBackend";

/**
 * GroupTreeSelect - 群组树形选择器组件
 * 
 * @param {Object} props - 组件属性
 * @param {string} props.organizationName - 组织名称
 * @param {string|string[]} props.value - 选中的值（单选为字符串，多选为数组）
 * @param {function} props.onChange - 值变化回调函数
 * @param {boolean} props.multiple - 是否多选，默认 false
 * @param {boolean} props.disabled - 是否禁用，默认 false
 * @param {Object} props.style - 自定义样式
 * @param {string} props.placeholder - 占位文本
 * @param {boolean} props.allowClear - 是否允许清空，默认 true
 * @param {string} props.excludeGroupName - 需要排除的群组名称（用于编辑群组时排除自身）
 * @param {boolean} props.includeOrganization - 是否包含组织作为顶级选项，默认 false
 * @param {boolean} props.showAll - 是否显示"全部"选项，默认 false
 * @param {boolean} props.showDefault - 是否显示"默认"选项，默认 false
 * @param {Array} props.groups - 外部传入的群组数据（可选，如果不传则自动获取）
 * @param {function} props.onPhysicalGroupCheck - Physical 群组数量检查回调
 * @param {string} props.valueFormat - 值的格式，"full"=owner/name（默认），"name"=仅群组名称
 */
function GroupTreeSelect(props) {
  const {
    organizationName,
    value,
    onChange,
    multiple = false,
    disabled = false,
    style = {width: "100%"},
    placeholder,
    allowClear = true,
    excludeGroupName,
    includeOrganization = false,
    showAll = false,
    showDefault = false,
    groups: externalGroups,
    onPhysicalGroupCheck,
    valueFormat = "full",
  } = props;

  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  /**
   * 检查数据是否已经是树形结构（包含 children 属性）
   * @param {Array} data - 群组数据
   * @returns {boolean} 是否是树形结构
   */
  const isTreeData = (data) => {
    if (!Array.isArray(data) || data.length === 0) {
      return false;
    }
    // 检查是否有任何节点有 children 属性，或者是否有 key/title 等树形结构特征
    return data.some(item =>
      (item.children && item.children.length > 0) ||
      (item.key !== undefined && item.title !== undefined)
    );
  };

  /**
   * 将扁平的群组列表转换为树形结构
   * @param {Array} flatGroups - 扁平的群组列表
   * @param {string} parentId - 父级ID（空字符串表示顶级）
   * @returns {Array} 树形结构数据
   */
  const convertFlatToTree = (flatGroups, parentId = "") => {
    const result = [];

    for (const group of flatGroups) {
      // 判断是否是当前父级的子节点
      // isTopGroup=true 或 parentId 为空或等于组织名时，视为顶级节点
      const isTopLevel = group.isTopGroup || !group.parentId || group.parentId === organizationName;
      const isCurrentChild = parentId === "" ? isTopLevel : group.parentId === parentId;

      if (isCurrentChild) {
        const node = {
          title: group.displayName || group.name,
          key: group.name,
          type: group.type,
          owner: group.owner,
          parentId: group.parentId,
          displayName: group.displayName,
          // 递归获取子节点
          children: convertFlatToTree(flatGroups, group.name),
        };
        // 如果没有子节点，删除 children 属性
        if (node.children.length === 0) {
          delete node.children;
        }
        result.push(node);
      }
    }

    return result;
  };

  // 获取群组数据
  React.useEffect(() => {
    if (externalGroups && externalGroups.length > 0) {
      // 检查外部传入的数据是否是树形结构
      if (isTreeData(externalGroups)) {
        // 已经是树形结构，直接使用
        setGroups(externalGroups);
      } else {
        // 是扁平结构，转换为树形结构
        const treeData = convertFlatToTree(externalGroups);
        setGroups(treeData);
      }
    } else if (organizationName) {
      setLoading(true);
      GroupBackend.getGroups(organizationName, true)
        .then((res) => {
          if (res.status === "ok") {
            setGroups(res.data || []);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [organizationName, externalGroups]);

  /**
   * 构建群组的完整路径
   * @param {Object} group - 群组对象
   * @param {Object} groupMap - 群组名称到群组对象的映射
   * @returns {string} 完整路径
   */
  const buildGroupPath = (group, groupMap) => {
    const pathParts = [group.displayName || group.title || group.name];
    let currentGroup = group;

    // 向上遍历父级节点构建完整路径
    while (currentGroup.parentId && groupMap[currentGroup.parentId]) {
      currentGroup = groupMap[currentGroup.parentId];
      pathParts.unshift(currentGroup.displayName || currentGroup.title || currentGroup.name);
    }

    return pathParts.join(" / ");
  };

  /**
   * 将群组列表转换为扁平映射（用于快速查找）
   * @param {Array} groups - 群组树形数据
   * @returns {Object} 群组名称到群组对象的映射
   */
  const buildGroupMap = (groups) => {
    const map = {};

    const traverse = (nodes, parent = null) => {
      nodes.forEach(node => {
        const groupData = {
          name: node.key || node.name,
          displayName: node.title || node.displayName,
          type: node.type,
          owner: node.owner,
          parentId: parent ? (parent.key || parent.name) : node.parentId,
        };
        map[groupData.name] = groupData;

        if (node.children && node.children.length > 0) {
          traverse(node.children, node);
        }
      });
    };

    traverse(groups);
    return map;
  };

  /**
   * 将树形群组数据转换为 TreeSelect 需要的数据格式
   * @param {Array} nodes - 群组树形节点
   * @param {Object} groupMap - 群组映射
   * @param {string} owner - 组织名称
   * @returns {Array} TreeSelect 数据
   */
  const convertToTreeData = (nodes, groupMap, owner) => {
    return nodes.map(node => {
      const groupName = node.key || node.name;
      const displayName = node.displayName || node.title || groupName;
      const fullPath = buildGroupPath({...node, name: groupName}, groupMap);
      // 根据 valueFormat 决定返回的值格式
      const nodeValue = valueFormat === "name" ? groupName : `${owner}/${groupName}`;

      // 如果需要排除某个群组（如编辑时排除自身）
      if (excludeGroupName && groupName === excludeGroupName) {
        return null;
      }

      const treeNode = {
        // 树形结构中只显示当前节点名称，层级关系通过缩进体现
        title: (
          <span>
            {node.type === "Physical" ? <UsergroupAddOutlined style={{marginRight: 4}} /> : <HolderOutlined style={{marginRight: 4}} />}
            {displayName}
          </span>
        ),
        value: nodeValue,
        key: nodeValue,
        // 存储额外数据用于后续处理和搜索
        groupType: node.type,
        groupName: groupName,
        fullPath: fullPath,  // 完整路径保留用于搜索
      };

      // 递归处理子节点
      if (node.children && node.children.length > 0) {
        treeNode.children = convertToTreeData(node.children, groupMap, owner)
          .filter(child => child !== null);
      }

      return treeNode;
    }).filter(node => node !== null);
  };

  /**
   * 生成 TreeSelect 的树形数据
   */
  const getTreeData = () => {
    const treeData = [];

    // 添加"全部"选项
    if (showAll) {
      treeData.push({
        title: i18next.t("organization:All"),
        value: "*",
        key: "*",
      });
    }

    // 添加"默认"选项
    if (showDefault) {
      treeData.push({
        title: i18next.t("general:Default"),
        value: "",
        key: "__default__",
      });
    }

    // 构建群组映射
    const groupMap = buildGroupMap(groups);

    // 添加组织作为顶级选项（用于编辑群组时选择父级）
    if (includeOrganization && organizationName) {
      treeData.push({
        title: (
          <span>
            <UsergroupAddOutlined style={{marginRight: 4}} />
            {organizationName} ({i18next.t("group:Organization root")})
          </span>
        ),
        value: organizationName,
        key: `__org__${organizationName}`,
        fullPath: organizationName,
      });
    }

    // 添加群组树形数据
    const groupTreeData = convertToTreeData(groups, groupMap, organizationName);
    treeData.push(...groupTreeData);

    return treeData;
  };

  /**
   * 将普通值转换为 treeCheckStrictly 模式所需的 {value, label} 格式
   * @param {string|string[]} val - 原始值
   * @returns {Object|Object[]} 转换后的值
   */
  const convertToLabeledValue = (val) => {
    if (!multiple || !val) {
      return val;
    }
    const values = Array.isArray(val) ? val : [val];
    return values.map(v => ({value: v, label: v}));
  };

  /**
   * 处理值变化
   * 注意：当 treeCheckStrictly=true 时，多选模式下 newValue 格式为 [{value, label}] 对象数组
   */
  const handleChange = (newValue, labelList, extra) => {
    // treeCheckStrictly 模式下需要提取实际值
    let actualValue = newValue;
    if (multiple && Array.isArray(newValue) && newValue.length > 0 && typeof newValue[0] === "object") {
      // treeCheckStrictly 模式，值为 [{value, label}] 格式，提取 value
      actualValue = newValue.map(item => item.value);
    }

    // 如果需要检查 Physical 群组数量
    if (multiple && onPhysicalGroupCheck) {
      const groupMap = buildGroupMap(groups);
      const selectedGroups = (Array.isArray(actualValue) ? actualValue : [actualValue])
        .filter(v => v && v !== "*" && v !== "")
        .map(v => {
          // 根据 valueFormat 确定如何提取群组名称
          const groupName = valueFormat === "name" ? v : (v.includes("/") ? v.split("/")[1] : v);
          return groupMap[groupName];
        })
        .filter(g => g);

      const physicalCount = selectedGroups.filter(g => g?.type === "Physical").length;
      if (physicalCount > 1) {
        onPhysicalGroupCheck(false);
        return;
      }
    }

    onChange?.(actualValue);
  };

  /**
   * 自定义过滤函数，支持搜索群组名称和路径
   */
  const filterTreeNode = (inputValue, treeNode) => {
    const searchValue = inputValue.toLowerCase();
    const title = treeNode.fullPath || treeNode.title?.props?.children?.[1] || "";
    const titleStr = typeof title === "string" ? title : "";

    return titleStr.toLowerCase().includes(searchValue) ||
           (treeNode.groupName || "").toLowerCase().includes(searchValue);
  };

  return (
    <TreeSelect
      showSearch
      style={style}
      value={multiple ? convertToLabeledValue(value) : value}
      dropdownStyle={{maxHeight: 400, overflow: "auto"}}
      placeholder={placeholder || (multiple ? i18next.t("general:Please select groups") : i18next.t("general:Please select a group"))}
      allowClear={allowClear}
      multiple={multiple}
      treeCheckable={multiple}
      treeCheckStrictly={multiple}  // 禁用级联勾选，允许单独选择任意节点
      showCheckedStrategy={TreeSelect.SHOW_ALL}
      treeDefaultExpandAll
      disabled={disabled}
      loading={loading}
      onChange={handleChange}
      treeData={getTreeData()}
      filterTreeNode={filterTreeNode}
      treeNodeFilterProp="title"
      virtual={false}
    />
  );
}

export default GroupTreeSelect;
